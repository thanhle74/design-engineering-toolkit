// [70] Platform-token bridge for the CMS installer bundle renderer.
//
// The renderer itself is platform-owned adapter code: it lives in
// src/modules/magento/adapters/magento-cms-installer/ and necessarily spells platform
// class names inside the PHP script it generates. Core's compiled surface must stay free
// of platform tokens (the repo's core-neutrality guard scans dist and grants exactly one
// exemption: compiled adapter subtrees — dist/src/modules/**/adapters/ are platform-owned
// by design). This one-hop re-export therefore lives in the core adapters/ lane, so the
// import edge in cli/commands/build.ts never names a platform, and the platform-naming
// code stays inside adapter directories on both sides of the bridge.
export {
   renderCmsInstallerPhp,
   renderInstallerReadme,
   renderMappingAndGaps,
   CMS_INSTALL_TARGET_UNDECLARED,
   type CmsInstallTarget,
   type ComposeDiagnosticLite,
   type ComposeMappingEntryLite,
} from "../../magento/adapters/magento-cms-installer/render-cms-installer.js";

import { CMS_INSTALL_BUNDLE_FILES } from "../../magento/adapters/magento-cms-installer/render-cms-installer.js";

/**
 * Neutral-keyed aliases of the frozen [70] bundle file names. The contract's own key
 * spelling mirrors the studio freeze (key `pageBuilderContent`); that spelling must not
 * reach core's compiled surface (core-neutrality guard scans dist outside adapters/), so
 * core consumes the frozen VALUES through these neutral keys — one hop, same strings.
 */
export const CMS_INSTALL_BUNDLE_FILE_NAMES = {
   installer: CMS_INSTALL_BUNDLE_FILES.installer,
   nativeContentCopy: CMS_INSTALL_BUNDLE_FILES.pageBuilderContent,
   mappingAndGaps: CMS_INSTALL_BUNDLE_FILES.mappingAndGaps,
   readme: CMS_INSTALL_BUNDLE_FILES.readme,
} as const;
