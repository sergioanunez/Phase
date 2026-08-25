const path = require("path")
const fs = require("fs")

async function main() {
  let puppeteer
  try {
    puppeteer = require("puppeteer-core")
  } catch {
    puppeteer = require("puppeteer")
  }

  const chromePath =
    process.env.CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  const htmlPath = path.resolve(__dirname, "p1-implementation-report.html")
  const pdfPath = path.resolve(
    __dirname,
    "Phase-Performance-Optimization-P1-Report.pdf"
  )

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Missing HTML source: ${htmlPath}`)
  }

  const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/")

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--disable-gpu", "--allow-file-access-from-files"],
  })

  try {
    const page = await browser.newPage()
    await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 60_000 })
    await page.pdf({
      path: pdfPath,
      format: "Letter",
      printBackground: true,
      margin: { top: "0.55in", right: "0.5in", bottom: "0.55in", left: "0.5in" },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px;width:100%;padding:0 0.5in;color:#5c6478;font-family:Segoe UI,sans-serif;">Phase · Performance Optimization P1</div>`,
      footerTemplate: `<div style="font-size:8px;width:100%;padding:0 0.5in;color:#5c6478;font-family:Segoe UI,sans-serif;display:flex;justify-content:space-between;"><span>P1 COMPLETE · Conservative</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    })
    console.log(`Wrote ${pdfPath}`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
