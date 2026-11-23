import { isHostMessage, type HostMessage } from '../protocol';

/**
 * The webview listens to the extension host and to nothing else.
 *
 * The host's message reaches the webview carrying the webview's own origin
 * -- `vscode-webview://<id>` on the desktop, `https://<id>.vscode-cdn.net` in
 * vscode.dev -- because the frame that relays it shares that origin. A
 * message from any other origin did not come from the extension host, so it
 * is dropped before its payload is even looked at.
 *
 * The origin check and the payload check are both needed: the first one
 * says who is talking, the second one says what they are allowed to say.
 */
export function createHostMessageHandler(
  origin: string,
  apply: (message: HostMessage) => void,
): (event: MessageEvent<unknown>) => void {
  return (event: MessageEvent<unknown>) => {
    if (event.origin !== origin) return;
    if (!isHostMessage(event.data)) return;
    apply(event.data);
  };
}
