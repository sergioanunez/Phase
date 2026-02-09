import Link from "next/link"

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-sm text-gray-600">
            Flow control for homebuilders.
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-6" aria-label="Footer">
            <Link
              href="/contact"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
            >
              Contact
            </Link>
            <a
              href="#"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
            >
              Privacy
            </a>
          </nav>
        </div>
      </div>
    </footer>
  )
}
