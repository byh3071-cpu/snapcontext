# `.vhk/` — VHK runtime state

이 디렉토리는 VHK가 프로젝트별 상태를 저장하는 곳입니다.
전체 규격은 [vhk 규격 문서](https://github.com/byh3071-cpu/vhk/blob/main/docs/spec.md) (spec_version 1.0) 참조.

## 트래킹 정책

| 파일 | 트래킹 | 용도 |
| --- | --- | --- |
| `README.md` | ✅ | 본 안내 |
| `context.md` | ✅ | 프로젝트 맥락 (`vhk context` 로 갱신) |
| `brief.md` | ✅ | 상태 요약 브리핑 (`vhk brief`) |
| `memory.json` | ❌ 로컬 전용 | 의사결정 메모 (`vhk memory add`) |
| `refs.json` | ❌ 로컬 전용 | 참고 URL (`vhk ref add`) |
| `HARD_STOP` | ❌ 로컬 전용 | 존재하면 모든 자동화 즉시 중단 |

> `memory.json`·`refs.json` 은 개인 메모 노출 방지를 위해 `.gitignore` 에 등록됩니다.
> `HARD_STOP` 해제는 `vhk resume --confirm` 으로만 가능합니다.
