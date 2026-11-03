<?php
// SYNTHETIC FIXTURE — inert marker, not a real secret. The adapter deny list must ensure this
// file is NEVER READ; the tests assert the marker never reaches any emitted payload.
return [
    'MAGENTO_LIKE_FIXTURE_SECRET_MARKER_9f3e1' => 'do-not-leak',
    'db' => [
        'host' => 'fixture-db.invalid'
    ]
];
