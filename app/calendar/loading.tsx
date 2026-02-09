export default function CalendarLoading() {
  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20 animate-pulse">
      <div className="app-container px-4">
        <header className="mb-4 flex items-center justify-between">
          <div className="h-8 w-28 rounded bg-[#E6E8EF]" />
          <div className="flex gap-2">
            <div className="h-9 w-20 rounded-full bg-[#E6E8EF]" />
            <div className="h-9 w-16 rounded-full bg-[#E6E8EF]" />
            <div className="h-9 w-24 rounded-full bg-[#E6E8EF]" />
          </div>
        </header>
        <div className="mb-4 flex gap-2">
          <div className="h-8 w-12 rounded bg-[#E6E8EF]" />
          <div className="h-8 w-14 rounded bg-[#E6E8EF]" />
          <div className="h-8 w-16 rounded bg-[#E6E8EF]" />
        </div>
        <div className="rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-24 flex-1 rounded-lg bg-[#E6E8EF]" />
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-10 w-full rounded bg-[#E6E8EF]" />
            <div className="h-10 w-5/6 rounded bg-[#E6E8EF]" />
            <div className="h-10 w-4/6 rounded bg-[#E6E8EF]" />
          </div>
        </div>
      </div>
    </div>
  )
}
