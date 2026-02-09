export default function HomesLoading() {
  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20 animate-pulse">
      <div className="app-container px-4">
        <header className="mb-6 flex items-center justify-between">
          <div className="h-8 w-40 rounded bg-[#E6E8EF]" />
          <div className="h-10 w-24 rounded bg-[#E6E8EF]" />
        </header>
        <div className="mb-4 flex gap-2">
          <div className="h-9 w-20 rounded-full bg-[#E6E8EF]" />
          <div className="h-9 w-24 rounded-full bg-[#E6E8EF]" />
          <div className="h-9 w-16 rounded-full bg-[#E6E8EF]" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-[#E6E8EF] bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="h-5 w-48 rounded bg-[#E6E8EF]" />
                <div className="h-8 w-20 rounded bg-[#E6E8EF]" />
              </div>
              <div className="mt-2 h-4 w-32 rounded bg-[#E6E8EF]" />
              <div className="mt-3 flex gap-2">
                <div className="h-6 w-16 rounded bg-[#E6E8EF]" />
                <div className="h-6 w-20 rounded bg-[#E6E8EF]" />
                <div className="h-6 w-14 rounded bg-[#E6E8EF]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
