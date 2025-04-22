/** @jsx jsx */
import { jsx } from 'hono/jsx';

export interface GoogleSignInButtonProps {
  clientId: string;
  loginUri: string;
}

export function GoogleSignInButton({ clientId, loginUri }: GoogleSignInButtonProps): JSX.Element {
  return (
    <div>
      <div class="flex justify-center">
        <div
          id="g_id_onload"
          data-client_id={clientId}
          data-context="signin"
          data-ux_mode="redirect"
          data-login_uri={loginUri}
          data-auto_prompt="false"
        ></div>
        <div
          class="g_id_signin"
          data-type="standard"
          data-shape="rectangular"
          data-theme="outline"
          data-text="signin_with"
          data-size="large"
          data-logo_alignment="left"
        ></div>
      </div>
      <script src="https://accounts.google.com/gsi/client" async defer></script>
    </div>
  );
}
