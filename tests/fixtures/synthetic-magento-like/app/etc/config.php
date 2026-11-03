<?php
/**
 * Synthetic fixture config.php (issue #9). Mirrors the observed shape: 4-space indent,
 * single-quoted keys, one 'Module_Name' => 0|1 per line, no array_merge/require.
 */
return [
    'modules' => [
        'Magento_Backend' => 1,
        'Magento_PageBuilder' => 1,
        'Example_CustomWidgets' => 1,
        'Example_DisabledWidgets' => 0,
        'Magento_TwoFactorAuth' => 0
    ],
    'system' => [
        'default' => [
            'general' => [
                'locale' => [
                    'code' => 'en_US'
                ]
            ]
        ]
    ]
];
