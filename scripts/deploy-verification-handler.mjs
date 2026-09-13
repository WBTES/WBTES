import nextEnv from "@next/env";
import { cert } from "firebase-admin/app";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const projectId = required("FIREBASE_ADMIN_PROJECT_ID");
const siteId = process.env.FIREBASE_HOSTING_SITE?.trim() || projectId;
const publicDirectory = resolve(process.cwd(), "firebase-hosting");
const credential = cert({
  projectId,
  clientEmail: required("FIREBASE_ADMIN_CLIENT_EMAIL"),
  privateKey: required("FIREBASE_ADMIN_PRIVATE_KEY")
    .replace(/\\n/g, "\n")
    .replace(/^"|"$/g, ""),
});
const accessToken = (await credential.getAccessToken()).access_token;
const files = await loadFiles(publicDirectory);
let versionName = "";

try {
  const version = await hostingRequest(`/sites/${siteId}/versions`, {
    method: "POST",
    body: JSON.stringify({
      config: {
        cleanUrls: true,
        headers: [
          {
            glob: "**",
            headers: {
              "Content-Security-Policy": [
                "default-src 'self'",
                "script-src 'self' https://www.gstatic.com",
                "style-src 'self'",
                "connect-src https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
                "img-src 'self' data:",
                "font-src 'self'",
                "frame-ancestors 'none'",
                "base-uri 'none'",
                "form-action 'self'",
              ].join("; "),
              "Referrer-Policy": "no-referrer",
              "X-Content-Type-Options": "nosniff",
              "X-Frame-Options": "DENY",
            },
          },
          {
            glob: "**",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          },
          {
            glob: "**/*.{css,js}",
            headers: {
              "Cache-Control": "public, max-age=3600",
            },
          },
        ],
      },
      labels: {
        source: "wbtes-email-verification",
      },
    }),
  });
  versionName = version.name;
  const fileMap = Object.fromEntries(
    files.map((file) => [file.path, file.hash])
  );
  const population = await hostingRequest(
    `/${versionName}:populateFiles`,
    {
      method: "POST",
      body: JSON.stringify({ files: fileMap }),
    }
  );

  for (const hash of population.uploadRequiredHashes ?? []) {
    const file = files.find((candidate) => candidate.hash === hash);
    if (!file) throw new Error(`Firebase requested an unknown file hash: ${hash}`);
    const response = await fetch(`${population.uploadUrl}/${hash}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: file.compressed,
    });
    if (!response.ok) {
      throw new Error(
        `Upload failed for ${file.path}: ${response.status} ${await response.text()}`
      );
    }
  }

  await hostingRequest(`/${versionName}?update_mask=status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "FINALIZED" }),
  });
  await hostingRequest(
    `/sites/${siteId}/releases?versionName=${encodeURIComponent(versionName)}`,
    { method: "POST" }
  );

  console.log(
    `WBTE verification handler deployed to https://${siteId}.web.app/verify-email`
  );
} catch (error) {
  if (versionName) {
    await hostingRequest(`/${versionName}?update_mask=status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "DELETED" }),
    }).catch(() => {});
  }
  throw error;
}

async function hostingRequest(path, options) {
  const response = await fetch(
    `https://firebasehosting.googleapis.com/v1beta1${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    }
  );
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      data.error?.message
        || `Firebase Hosting request failed with HTTP ${response.status}.`
    );
  }
  return data;
}

async function loadFiles(directory) {
  const paths = await walk(directory);
  return Promise.all(paths.map(async (absolutePath) => {
    const content = await readFile(absolutePath);
    const compressed = gzipSync(content, { level: 9 });
    return {
      path: `/${relative(directory, absolutePath).split(sep).join("/")}`,
      compressed,
      hash: createHash("sha256").update(compressed).digest("hex"),
    };
  }));
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return nested.flat();
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
