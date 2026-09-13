import nextEnv from "@next/env";
import { cert } from "firebase-admin/app";
import { readFile } from "node:fs/promises";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const projectId = required("FIREBASE_ADMIN_PROJECT_ID");
const credential = cert({
  projectId,
  clientEmail: required("FIREBASE_ADMIN_CLIENT_EMAIL"),
  privateKey: required("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n").replace(/^"|"$/g, ""),
});
const token = (await credential.getAccessToken()).access_token;
const content = await readFile("firestore.rules", "utf8");
const base = `https://firebaserules.googleapis.com/v1/projects/${projectId}`;

const ruleset = await request(`${base}/rulesets`, {
  method: "POST",
  body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content }] } }),
});
await request(`${base}/releases/cloud.firestore`, {
  method: "PATCH",
  body: JSON.stringify({
    release: {
      name: `projects/${projectId}/releases/cloud.firestore`,
      rulesetName: ruleset.name,
    },
  }),
});
console.log(`Deployed ${ruleset.name} to cloud.firestore.`);

async function request(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error?.message || `Request failed (${response.status}).`);
  return data;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
