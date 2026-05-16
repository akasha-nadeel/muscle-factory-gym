import { render } from "@react-email/render";
import type { ReactElement } from "react";

/**
 * Renders a React Email component to an HTML string suitable for the
 * `html` field of a Resend send. Uses inline styles via @react-email/render.
 */
export async function renderEmail(component: ReactElement): Promise<string> {
  return await render(component);
}
