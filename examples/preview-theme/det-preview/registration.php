<?php
/**
 * DET Preview Theme registration (issue #28).
 *
 * The toolkit's one independent, reusable Hyvä child preview theme. Copy this directory into the
 * target checkout under `app/design/frontend/DET/preview` and run `bin/magento setup:upgrade`
 * (see README.md). It extends the licensed Hyvä base installed in that checkout; no Hyvä source
 * is bundled or redistributed here.
 */

use \Magento\Framework\Component\ComponentRegistrar;

ComponentRegistrar::register(ComponentRegistrar::THEME, 'frontend/DET/preview', __DIR__);
