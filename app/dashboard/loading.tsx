export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20 animate-pulse">
      <div className="app-container px-4">
        <header className="mb-6">
          <div className="h-8 w-48 rounded bg-[#E6E8EF]" />
          <div className="mt-2 h-4 w-full max-w-xl rounded bg-[#E6E8EF]" />
        </header>
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#E6E8EF] bg-white p-6 shadow-sm">
            <div className="h-5 w-40 rounded bg-[#E6E8EF]" />
            <div className="mt-4 flex gap-4">
              <div className="h-10 flex-1 rounded bg-[#E6E8EF]" />
              <div className="h-10 flex-1 rounded bg-[#E6E8EF]" />
              <div className="h-10 flex-1 rounded bg-[#E6E8EF]" />
            </div>
          </div>
          <div className="rounded-2xl border border-[#E6E8EF] bg-white p-6 shadow-sm">
            <div className="h-5 w-32 rounded bg-[#E6E8EF]" />
            <div className="mt-4 space-y-2">
              <div className="h-12 w-full rounded bg-[#E6E8EF]" />
              <div className="h-12 w-4/5 rounded bg-[#E6E8EF]" />
              <div className="h-12 w-3/5 rounded bg-[#E6E8EF]" />
            </div>
          </div>
          <div className="rounded-2xl border border-[#E6E8EF] bg-white p-6 shadow-sm">
            <div className="h-5 w-36 rounded bg-[#E6E8EF]" />
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded bg-[#E6E8EF]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
