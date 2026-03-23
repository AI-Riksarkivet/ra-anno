import type { PageLoad } from "./$types";

export interface PageInfo {
  page_id: string;
  doc_id: string;
  page_num: number;
}

export const load: PageLoad = async ({ params, fetch }) => {
  const { datasetId, docId, pageNum } = params;

  // Fetch all pages for this document (filtered by doc_id, sorted by page_num)
  const res = await fetch(
    `/api/thumbnails/${datasetId}?doc_id=${docId}&sort=page_num&order=asc&limit=1000`,
  );
  const data = await res.json();
  const pages: PageInfo[] = data.pages;

  const currentPageNum = Number(pageNum);
  const currentPage = pages.find((p) => p.page_num === currentPageNum);

  return {
    datasetId,
    docId,
    pageNum: currentPageNum,
    pageId: currentPage?.page_id ??
      `mock-page-${String(currentPageNum).padStart(3, "0")}`,
    pages,
    totalPages: pages.length,
  };
};
