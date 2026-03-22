import type { RequestHandler } from "./$types";

// Mock thumbnail image — generates a small SVG for each page
export const GET: RequestHandler = ({ params }) => {
  const pageNum = params.pageId.replace("mock-page-", "");
  const hue = (parseInt(pageNum) * 37) % 360;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="275">
    <rect width="100%" height="100%" fill="hsl(${hue}, 15%, 95%)"/>
    <rect x="10" y="10" width="180" height="255" fill="none" stroke="hsl(${hue}, 20%, 75%)" stroke-width="1"/>
    <text x="100" y="130" text-anchor="middle" font-family="serif" font-size="14" fill="hsl(${hue}, 30%, 40%)">Page ${pageNum}</text>
    ${
    Array.from({ length: 8 }, (_, i) =>
      `<line x1="25" y1="${50 + i * 20}" x2="175" y2="${
        50 + i * 20
      }" stroke="hsl(${hue}, 10%, 80%)" stroke-width="0.5"/>`).join("")
  }
  </svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
