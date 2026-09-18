// Hand-written: `i18next-type-generator` only emits `resources` (see its README), so `defaultNS`
// has to be declared separately, matching the runtime `defaultNS: 'default'` option these fixtures
// are loaded with.
import "i18next";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "default";
  }
}
