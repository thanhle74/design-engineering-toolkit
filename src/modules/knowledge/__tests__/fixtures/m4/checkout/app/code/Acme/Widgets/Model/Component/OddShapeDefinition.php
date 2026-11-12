<?php
// FIXTURE_DEFINITION_BODY_MARKER_never_emit_2c9e — deliberately unsupported shape: no named
// scalar metadata at all (positional constructor only), so the scan must answer UNKNOWN.
declare(strict_types=1);

namespace Acme\Widgets\Model\Component;

final class OddShapeDefinition
{
    private array $legacy;

    public function __construct(array $legacyConfig)
    {
        $this->legacy = $legacyConfig;
    }
}
