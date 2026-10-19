# 南京选择册：景点、夜游与路线估算

## Goal
补充梧桐大道和夜间玩法；每处景点要说明典型体验；路线估算不依赖用户添加顺序；公开说明估算来源和可信度。

## Phases
- [complete] Research public guide sources, attraction durations and platform accessibility.
- [complete] Update attraction metadata, night period and order-independent route estimate.
- [complete] Verify tests, build and mobile interactions.
- [complete] Clarify empty-area selections in the date rail and allow clearing an area anchor from an empty period.
- [complete] Support arbitrary image filenames and multi-photo attraction galleries; validate current uploads.
- [complete] Rename attraction photo folders to Chinese names and keep gallery lookup mapped by attraction ID.
- [complete] Add suitable/not-suitable visitor guidance to every attraction preview.

## Decisions
- Keep GitHub Pages static and preserve link-based participant sharing.
- Treat map travel estimates as planning ranges, not live navigation.
- Night activities are a separate time period.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| First browser route check exceeded the 4-hour budget after three long attractions | 1 | Re-ran with a valid Zhongshan combination while retaining order-independence coverage |
| PM-to-night test expected the wrong range | 1 | Corrected expected interval to the modeled Xuanwu-to-city-center range of 20–35 minutes |
| Gallery browser test checked the counter before the new image finished loading | 1 | Waited for the image load event's counter update before asserting the selected image |
