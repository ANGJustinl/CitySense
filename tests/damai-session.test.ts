import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDamaiCookieHeader,
  filterDamaiCookies
} from "@/server/sources/plugins/damai-session";

test("damai session cookie filter keeps Damai anonymous cookies and drops account state", () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const cookies = filterDamaiCookies([
    {
      name: "x5sec",
      value: "captcha-ok",
      domain: ".damai.cn",
      expires: future
    },
    {
      name: "cna",
      value: "anonymous-device",
      domain: "search.damai.cn",
      expires: future
    },
    {
      name: "_m_h5_tk",
      value: "mtop-anonymous",
      domain: ".damai.cn",
      expires: future
    },
    {
      name: "tracknick",
      value: "some-user",
      domain: ".damai.cn",
      expires: future
    },
    {
      name: "foreign",
      value: "outside",
      domain: ".taobao.com",
      expires: future
    },
    {
      name: "expired",
      value: "old",
      domain: ".damai.cn",
      expires: Math.floor(Date.now() / 1000) - 30
    }
  ]);

  assert.deepEqual(
    cookies.map((cookie) => cookie.name),
    ["x5sec", "cna", "_m_h5_tk"]
  );

  const header = buildDamaiCookieHeader(cookies);

  assert.match(header, /x5sec=captcha-ok/);
  assert.match(header, /cna=anonymous-device/);
  assert.doesNotMatch(header, /some-user|outside|old/);
});
