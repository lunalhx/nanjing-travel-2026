# Research Findings

## Wutong Avenue

- A DuckDuckGo-indexed Douyin note, "钟山风景区省力游玩路线", describes the route 苜蓿园站 → 梧桐大道 → 美龄宫 → 明孝陵 → 中山陵 → 音乐台, says exit 1 at Muxuyuan station is about five minutes from the avenue, and describes the avenue section as a little over 1 km for walking/photos. The note is dated 2024-05-07; use as a route idea, not a current operational source: https://www.douyin.com/note/7366238503497190671
- A Sohu route roundup similarly groups 梧桐大道 with 明孝陵、美龄宫、音乐台 and 灵谷寺 in a Zhongshan scenic-area day: https://www.sohu.com/a/808588219_121948408
- Search snippets mention foliage/photography; exact late-October color is weather dependent. Do not promise peak foliage for a fixed date.
- Xiaohongshu direct search redirected to an HTTP URL and did not expose note results; indexed search only returned the platform home page. No specific Xiaohongshu post was independently verified.

## Route and Visit Estimates

- Existing duration values in `src/data.js` were manually authored heuristics, not map-engine results or measurements. Treat them as low-confidence planning estimates and say so in the UI.
- A route blog says a Zhongshan-area line including Wutong Avenue can be walked, while indexed Douyin search results describe a >1 km photo stroll. The attractions remain spread across a large hillside area; shuttles, reservation slots and walking pace change real travel time.
- To remove selection-order bias, compute the shortest pairwise route among the selected attractions (the first-leg origin remains unknown). Show the suggested visit order separately from selection order.
- Add explicit pair ranges for common Zhongshan sequences (Wutong Avenue ↔ Meiling Palace ↔ Ming Xiaoling ↔ Music Stage ↔ Sun Yat-sen Mausoleum) and nearby central museums, based on route adjacency from published itineraries. These are still manually assigned planning ranges, not measured route times.

## Night Use

- Existing attraction descriptions already identify Qinhuai Temple Street, Laomendong and Qinhuai River cruise as night-friendly. Add a separate night period and show only attractions explicitly marked as night-suitable. Verify seasonal operating hours before travel; street access does not guarantee ticketed venue or boat hours.
- Search results were inconsistent for current boat schedules/prices; retain the existing note to verify current departure time and fare with the operator.
