---
id: readme-yohan-studio-blog-import
date: 2026-05-24
tags: [yohan-studio, blog, snapcontext]
---

# Yohan Studio 블로그로 옮기기

## 1. 파일 복사

Yohan Studio 레포 기준:

| SnapContext (여기) | Yohan Studio |
|--------------------|--------------|
| `blog/snapcontext-v013-store-journey.mdx` | `src/app/blog/posts/snapcontext-v013-store-journey.mdx` |
| `blog/snapcontext-v013-store-journey.module.css` | 같은 폴더 또는 `src/styles/blog/` |

## 2. 스크린샷

```text
docs/store/chrome-web-store/screenshots/*.png
  → public/blog/snapcontext-v013/
```

MDX는 `/blog/snapcontext-v013/01-capture-controls.png` 경로를 사용한다.

## 3. 블로그 레이아웃

`src/app/blog/[slug]/page.tsx`에서 MDX import 시 CSS module 로드 확인.

`data-theme="dark"` 토글은 사이트 루트 레이아웃과 동일하게.

## 4. frontmatter

`snapcontext-v013-store-journey.mdx` 상단 `export const post` 객체를
기존 블로그 메타 스키마에 맞게 필드명만 조정하면 된다.
