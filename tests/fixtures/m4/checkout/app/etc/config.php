<?php
// Synthetic M4 fixture checkout configuration (issue #19). Every module name is invented; no
// real package, vendor or licensed content. The 'system' and 'scopes' sections exist to prove
// the scanner extracts ONLY the 'modules' block — their values must never appear in a payload.
return [
    'modules' => [
        'Acme_Core' => 1,
        'Acme_Widgets' => 1,
        'Acme_Legacy' => 0,
        'Acme_Headless' => 1,
        'Acme_Searchlite' => 1,
        'Acme_Emailonly' => 1,
        'Acme_Orphan' => 0,
        'Testvendor_Cmsbasic' => 1,
        'Testvendor_Ghostfinder' => 1,
        'Magento_Pagebuilderlike' => 1,
    ],
    'system' => [
        'install' => ['date' => 'FIXTURE_SYSTEM_SECTION_MARKER_never_emit_8a3f'],
    ],
    'scopes' => [
        'websites' => ['fixture-site' => 0],
    ],
];
