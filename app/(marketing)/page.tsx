import { Hero } from "@/components/sections/hero";
import { TrustBar } from "@/components/sections/trust-bar";
import { HomeContact, HomeOverview } from "@/components/sections/home-overview";
import { FeaturesGrid } from "@/components/sections/features-grid";
import { RolesSection } from "@/components/sections/roles-section";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Stats } from "@/components/sections/stats";
import { FAQ } from "@/components/sections/faq";
import { CTASection } from "@/components/sections/cta";

export default function HomePage() {
  return (
    <div className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Hero />
      <TrustBar />
      <HomeOverview />
      <HowItWorks />
      <FeaturesGrid />
      <RolesSection />
      <Stats />
      <HomeContact />
      <FAQ />
      <CTASection />
    </div>
  );
}
