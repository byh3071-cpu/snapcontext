/**
 * 섹션 헤딩 빌더 — 좌측 번호 인덱스(01~05) 정렬축 (디자인 SoT §sec-head)
 * [sec-num | eyebrow+title | aside] 그리드. 컴포넌트가 aside에 동적 요소를 꽂을 수 있다.
 */
export type SecHead = {
  head: HTMLDivElement
  titleEl: HTMLHeadingElement
  asideEl: HTMLSpanElement
}

export function mkSecHead(opts: {
  num: string
  eyebrow: string
  title: string
  titleId: string
  titleClass?: string
  /** 텍스트 aside(eyebrow 톤). asideNode와 배타 */
  asideText?: string
  /** 버튼 등 임의 aside 노드 */
  asideNode?: HTMLElement
}): SecHead {
  const head = document.createElement('div')
  head.className = 'sec-head'

  const num = document.createElement('span')
  num.className = 'sec-num tnum'
  num.setAttribute('aria-hidden', 'true')
  num.textContent = opts.num

  const titles = document.createElement('div')
  titles.className = 'sec-titles'
  const eyebrow = document.createElement('span')
  eyebrow.className = 'eyebrow'
  eyebrow.textContent = opts.eyebrow
  const title = document.createElement('h2')
  title.className = opts.titleClass ? `sec-title ${opts.titleClass}` : 'sec-title'
  title.id = opts.titleId
  title.textContent = opts.title
  titles.append(eyebrow, title)

  const aside = document.createElement('span')
  aside.className = 'sec-aside'
  if (opts.asideNode) {
    aside.append(opts.asideNode)
  } else if (opts.asideText) {
    aside.classList.add('eyebrow')
    aside.setAttribute('aria-hidden', 'true')
    aside.textContent = opts.asideText
  }

  head.append(num, titles, aside)
  return { head, titleEl: title, asideEl: aside }
}
