import assert from "node:assert/strict";
import test from "node:test";
import {
  __testing as weatherImpactTesting,
  getRouteWeatherImpact
} from "@/components/city/weather-impact";
import type { RecommendedRoute } from "@/server/recommendation/types";

function route(weatherFit: "good" | "ok" | "poor" | "unknown", value: string) {
  return {
    momentFit: {
      weatherFit,
      facts: [
        {
          label: "天气",
          value
        }
      ]
    }
  } as RecommendedRoute;
}

test("weather impact parses rain and exposes rain scene", () => {
  const impact = getRouteWeatherImpact(route("ok", "天气一般（小雨 24°）"));

  assert.equal(impact.scene, "rain");
  assert.equal(impact.temperatureLevel, "mild");
  assert.equal(impact.atmosphereClass, "weather-scene-rain");
  assert.equal(impact.effect, "避雨优先");
});

test("weather impact prioritizes storm over generic rain", () => {
  const impact = getRouteWeatherImpact(route("poor", "天气扰动（雷阵雨 23°）"));

  assert.equal(impact.scene, "storm");
  assert.equal(impact.routeEffect.glowColor, "#4c8fdc");
  assert.ok(impact.routeEffect.glowWeight > 24);
});

test("weather impact maps hot temperature to heat scene", () => {
  const impact = getRouteWeatherImpact(route("ok", "天气一般（阴 33°）"));

  assert.equal(impact.scene, "heat");
  assert.equal(impact.temperatureLevel, "warm");
  assert.equal(impact.effect, "避开暴晒");
});

test("weather impact maps cloudy and clear scenes", () => {
  assert.equal(getRouteWeatherImpact(route("ok", "天气一般（多云 28°）")).scene, "cloudy");
  assert.equal(getRouteWeatherImpact(route("good", "适合出行（晴 28°）")).scene, "clear");
});

test("weather impact still parses real fact when fit is unknown", () => {
  const impact = getRouteWeatherImpact(route("unknown", "高德天气（晴 28°）"));

  assert.equal(impact.scene, "clear");
  assert.equal(impact.atmosphereClass, "weather-scene-clear");
});

test("weather impact maps haze and dust to fog scene", () => {
  assert.equal(getRouteWeatherImpact(route("poor", "天气扰动（霾 25°）")).scene, "fog");
  assert.equal(getRouteWeatherImpact(route("poor", "天气扰动（扬沙 22°）")).scene, "fog");
});

test("weather impact does not render atmosphere for unknown weather", () => {
  const impact = getRouteWeatherImpact(route("unknown", "天气未接入"));

  assert.equal(impact.scene, "unknown");
  assert.equal(impact.atmosphereClass, "");
});

test("weather marker class highlights outdoor risk and indoor shelter", () => {
  const rain = getRouteWeatherImpact(route("ok", "天气一般（小雨 24°）"));
  const clear = getRouteWeatherImpact(route("good", "适合出行（晴 28°）"));

  assert.equal(
    weatherImpactTesting.getWeatherMarkerClass(rain, {
      kind: "stop",
      name: "滨江公园",
      tags: ["户外", "citywalk"]
    }),
    "weather-risk"
  );
  assert.equal(
    weatherImpactTesting.getWeatherMarkerClass(rain, {
      kind: "stop",
      name: "当代艺术馆",
      tags: ["展览", "室内"]
    }),
    "weather-shelter"
  );
  assert.equal(
    weatherImpactTesting.getWeatherMarkerClass(clear, {
      kind: "stop",
      name: "露天市集",
      tags: ["户外", "市集"]
    }),
    "weather-clear"
  );
});
