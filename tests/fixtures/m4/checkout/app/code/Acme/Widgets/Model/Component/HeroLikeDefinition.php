<?php
// Synthetic M4 fixture definition (issue #19): all names invented. The body marker below
// exists to prove the scanner extracts bounded metadata only, never file bodies. This fixture
// mirrors the REAL definition style (named arguments in parent::__construct + a fields schema
// method reference), so the scanner's named-argument parser is exercised end to end.
// FIXTURE_DEFINITION_BODY_MARKER_never_emit_2c9e
declare(strict_types=1);

namespace Acme\Widgets\Model\Component;

final class HeroLikeDefinition extends \Acme\Widgets\Model\Component\AbstractFixtureDefinition
{
    public function __construct()
    {
        parent::__construct(
            id: 'hero_like_a',
            label: 'Hero Like A',
            template: 'Acme_Widgets::components/hero/like-a.phtml',
            group: 'promotional',
            schemaVersion: 2,
            fields: $this->getFixtureFieldSchema(),
            sourceComponent: 'hero',
            sourceVersion: '2.8.0',
            sortOrder: 10
        );
    }

    private function getFixtureFieldSchema(): array
    {
        return [
            'headline' => 'text',
            'body_copy' => 'textarea',
            'cta_label' => 'text',
        ];
    }
}
