<?php
// Synthetic M4 fixture definition (issue #19): all names invented. The body marker below
// exists to prove the scanner extracts bounded metadata only, never file bodies.
// FIXTURE_DEFINITION_BODY_MARKER_never_emit_2c9e
declare(strict_types=1);

namespace Acme\Widgets\Model\Component;

final class HeroLikeDefinition
{
    public function __construct(
        string $label = 'Hero Like A',
        string $group = 'promotional',
        int $schemaVersion = 2,
        string $sourceComponent = 'hero',
        string $sourceVersion = '2.8.0',
        bool $enabled = true,
        array $fields = [
            'headline' => 'text',
            'body_copy' => 'textarea',
            'cta_label' => 'text',
        ]
    ) {
    }
}
