let _connected = false

export function isSiaConnected(): boolean {
  return _connected
}

export function disconnectSia(): void {
  _connected = false
}