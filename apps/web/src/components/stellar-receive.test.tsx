import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as receive from "./stellar-receive";

const address = "GANTUVPE7JSXMMZHEOHWAWBJY5BIKDW2KYYI2ELBWBRC2TL7THMT6Z5I";
const other = "GBIMQFMFVQ2JGNSKL6RGPBYW3MCV7WTUEMOEBB44EAVMKRXBZW7VROGR";

test("receiving QR exposes its full account and a white quiet zone", () => {
  const Qr = receive.StellarAccountQr;
  const html = renderToStaticMarkup(<Qr address={address} />);
  assert.match(html, /role="img"/);
  assert.ok(html.includes(address));
  assert.match(html, /fill="#fff"/);
  assert.match(html, /shape-rendering="crispEdges"/);
});

test("switching accounts replaces both QR pattern and description", () => {
  const Qr = receive.StellarAccountQr;
  const first = renderToStaticMarkup(<Qr address={address} />);
  const second = renderToStaticMarkup(<Qr address={other} />);
  assert.notEqual(first.match(/<path d="([^"]+)"/)?.[1], second.match(/<path d="([^"]+)"/)?.[1]);
  assert.ok(second.includes(other));
  assert.ok(!second.includes(address));
});
