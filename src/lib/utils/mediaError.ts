/**
 * getUserMedia fails for several distinct reasons. Reporting them all as a
 * permission problem sends users to a browser setting that is already correct —
 * which is exactly what both mic entry points used to do.
 */
export function describeMediaError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  console.error('[mic] getUserMedia failed:', name || 'unknown', error)

  switch (name) {
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '마이크 장치를 찾을 수 없어요. 마이크가 연결되어 있는지 확인해주세요.'
    case 'NotReadableError':
    case 'TrackStartError':
      return '다른 앱이 마이크를 사용 중이에요. 해당 앱을 종료한 뒤 다시 시도해주세요.'
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return '마이크 사용이 거부됐어요. 브라우저 사이트 권한과 시스템 설정 > 개인정보 보호 > 마이크를 모두 확인해주세요.'
    default:
      return `마이크를 열지 못했어요 (${name || '알 수 없는 오류'}). 페이지를 새로고침한 뒤 다시 시도해주세요.`
  }
}

/**
 * `navigator.mediaDevices` is absent outside a secure context — e.g. reaching a
 * dev server over a LAN IP instead of localhost. Without this check the
 * resulting TypeError surfaces as a bogus "permission denied".
 */
export function isMediaCaptureAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export const INSECURE_CONTEXT_MESSAGE =
  '이 주소에서는 마이크를 쓸 수 없어요. https 또는 localhost 주소로 접속해주세요.'
