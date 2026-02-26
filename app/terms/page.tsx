import Link from "next/link"
import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingNav } from "@/components/landing/landing-nav"

export const dynamic = "force-dynamic"

const LAST_UPDATED = "February 26, 2026"

export const metadata = {
  title: "Terms & Conditions",
  description: "Terms and conditions for Phase construction scheduling and confirmations.",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Terms & Conditions
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-8 text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              Acceptance of terms
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              By using Phase (&quot;the Service&quot;), you agree to these Terms &amp; Conditions.
              If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              Use of the Service
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              Phase provides scheduling, task confirmations, and operational tools for
              homebuilders and subcontractors. You agree to use the Service only for
              lawful purposes and in line with your role and permissions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              Account and data
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              You are responsible for keeping your account credentials secure. Data you
              provide is used to operate the Service and as described in our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 id="sms-consent" className="text-lg font-semibold text-gray-900">
              SMS Messaging Consent
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              By checking the SMS consent box during account registration and providing your phone number, you consent
              to receive transactional SMS notifications related to project scheduling, task confirmations, and
              operational updates from Phase. Reply STOP to unsubscribe. Reply HELP for help. Message and data rates may
              apply. Message frequency varies. We do not send marketing or promotional messages via this number.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              Changes
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              We may update these terms from time to time. The &quot;Last updated&quot; date at the top
              reflects the latest revision. Continued use of the Service after changes
              constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              Contact
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              For questions about these terms, please{" "}
              <Link href="/contact" className="text-primary underline-offset-2 hover:underline">
                contact us
              </Link>
              .
            </p>
          </section>
        </div>

        <p className="mt-12 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-primary hover:underline"
          >
            ← Back to home
          </Link>
        </p>
      </main>
      <LandingFooter />
    </div>
  )
}
