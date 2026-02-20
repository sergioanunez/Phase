import Link from "next/link"
import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingNav } from "@/components/landing/landing-nav"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for Phase construction scheduling and confirmations.",
}

function getLastUpdated() {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function getSupportEmail() {
  return process.env.SUPPORT_EMAIL ?? "support@phaseapp.com"
}

export default function PrivacyPage() {
  const lastUpdated = getLastUpdated()
  const supportEmail = getSupportEmail()

  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Last updated: {lastUpdated}
        </p>

        <div className="mt-10 space-y-8 text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              Introduction
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              Phase (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) provides construction scheduling and
              confirmation tools for homebuilders and subcontractors. This Privacy Policy
              describes how we collect, use, and protect your information when you use our
              services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              Information We Collect
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              We collect information you provide directly, such as name, email address,
              phone number, company details, and account credentials. We also collect
              information about how you use the service, including scheduling data, task
              confirmations, and related operational data necessary to run the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              How We Use Information
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              We use the information we collect to provide, maintain, and improve our
              services; to send scheduling and task-related notifications; to communicate
              with you about your account; and to comply with legal obligations. We do not
              use your information for purposes unrelated to the operation of the service
              without your consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              SMS Messaging
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              By providing your phone number, you consent to receive SMS notifications
              related to project scheduling and operational updates from Phase.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Message frequency varies.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Message and data rates may apply.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Reply STOP to unsubscribe.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Reply HELP for assistance.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              No marketing or promotional SMS messages are sent via this number.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              Information Sharing
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              We do not sell your personal information. We may share information with
              service providers who assist in operating our platform (e.g., hosting,
              SMS delivery) under contractual obligations to protect your data. We may
              also disclose information when required by law or to protect our rights and
              safety.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              Data Security
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              We use industry-standard measures to protect your data, including encryption
              in transit and at rest, access controls, and secure infrastructure. No method
              of transmission over the internet is 100% secure; we strive to protect your
              information but cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              Data Retention
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              We retain your information for as long as your account is active or as
              needed to provide the service and comply with legal obligations. You may
              request deletion of your account and associated data subject to applicable
              law and our retention requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              Your Rights
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              Depending on your location, you may have rights to access, correct, delete,
              or port your personal data, or to object to or restrict certain processing.
              To exercise these rights, contact us using the details below. You may also
              unsubscribe from SMS at any time by replying STOP.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              Contact Us
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              For privacy-related questions or to exercise your rights, contact us at{" "}
              <a
                href={`mailto:${supportEmail}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                {supportEmail}
              </a>
              . You can also use our{" "}
              <Link href="/contact" className="text-primary underline-offset-2 hover:underline">
                contact form
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
