/** Deep link to Theme Editor → App embeds for the voice widget block. */
export function themeAppEmbedUrl(
  shop: string,
  apiKey: string,
  blockHandle = "voice_button",
) {
  const params = new URLSearchParams({
    context: "apps",
    activateAppId: `${apiKey}/${blockHandle}`,
  });
  return `https://${shop}/admin/themes/current/editor?${params.toString()}`;
}
