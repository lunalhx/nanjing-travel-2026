# Progress Log

- Started research and implementation for adding Wutong Avenue, night activities, attraction-use descriptions, and order-independent route estimates.
- Researched indexed Douyin/Sohu routes; documented that Xiaohongshu note results were inaccessible. Existing duration values are manual heuristics, so the UI will identify them as low-confidence estimates.
- Added Wutong Avenue with a Douyin route source, activity tags for all listed attractions, and a dedicated night period for Qinhuai streets/boat ride and Xinjiekou dining.
- Replaced click-order travel totals with a shortest recommended route over selected stops. Pair ranges are specific for common Wutong/Meiling/Ming Xiaoling/Music Stage combinations and broader for other area pairs; the budget uses the upper bound.
- Verified 6 domain tests, production build, mobile route-order independence, evening-area continuity, PM-to-night travel ranges, and duplicate prevention across dates. Full-page mobile screenshot inspected.
- Diagnosed the follow-up screenshot: attraction count was zero, but selected area anchors remained in neighboring periods. Date status now shows reserved segments even without attraction picks, and clicking the active empty-period area clears that anchor; verified restriction updates on mobile.
- Found four valid Ming Xiaoling images with arbitrary existing filenames. Updated the build to scan nested attraction folders and emit an image manifest; added a no-crop gallery with previous/next controls and filename ordering. Browser-verified all four images load and navigation updates the counter.
- Renamed all 20 attraction photo folders to the Chinese display names. The build manifest maps those folder names back to stable attraction IDs; verified all six current Ming Xiaoling images load from `明孝陵/` and the gallery advances.
- Updated Music Stage preview copy to describe photo opportunities, unpredictable dove flight, and the photographer's approximate per-photo charge; build and tests pass.
- Added audience-fit guidance to every attraction. Verified required guidance fields in the data, built, passed 8 tests, and inspected mobile previews.
