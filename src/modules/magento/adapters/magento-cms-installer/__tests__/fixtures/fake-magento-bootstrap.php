<?php
/**
 * [74] TEST FIXTURE — a MINIMAL fake Magento bootstrap for the magento-cms-installer
 * hardening suite ONLY. It fakes exactly the service surface the generated installer
 * uses (App\Bootstrap/State/Console\Response, ObjectManager + ConfigLoader, the Area
 * const, Cms Page/Collection/CollectionFactory/PageRepository(PageRepositoryInterface)
 * and App\Cache\Manager) so the refusal gates, confirmation flags, media containment,
 * idempotency and the SCOPED cache clean can be executed END-TO-END against a
 * throwaway tmp directory.
 *
 * It NEVER touches a real Magento installation: page/save/cache behavior is driven by
 * environment variables pointing INSIDE the test's tmp dir:
 *  - DET_FAKE_PAGES_JSON : JSON array of existing pages [{id, identifier, storeIds:[..]}]
 *  - DET_FAKE_SAVE_LOG   : file receiving one JSON line per PageRepositoryInterface::save()
 *  - DET_FAKE_CACHE_LOG  : file receiving one JSON line per Cache\Manager::clean()
 */

namespace Magento\Framework {
    // The REAL app/bootstrap.php defines BP (the project base path) before anything else;
    // the installer's epilogue passes it to App\Bootstrap::create(BP, $_SERVER). define()
    // always creates a GLOBAL constant, so this works from inside a namespace block.
    if (!defined('BP')) {
        define('BP', dirname(__DIR__));
    }

    interface AppInterface
    {
        public function launch();

        public function catchException(\Magento\Framework\App\Bootstrap $bootstrap, \Exception $exception);
    }

    // The platform's own object-manager interface lives DIRECTLY under Magento\Framework.
    interface ObjectManagerInterface
    {
    }
}

namespace Magento\Framework\App {
    class State
    {
        public $areaCode;

        public function setAreaCode($code)
        {
            $this->areaCode = $code;
        }
    }

    class Area
    {
        const AREA_CRONTAB = 'crontab';
    }

    class Bootstrap
    {
        public static function create($bp, $server)
        {
            return new self();
        }

        public function createApplication($class)
        {
            $om = new \Magento\Framework\ObjectManager\ObjectManager();

            return new $class(new State(), new \Magento\Framework\App\Console\Response(), $om);
        }

        public function run($app)
        {
            $response = $app->launch();
            $response->sendResponse();
        }
    }
}

namespace Magento\Framework\App\Console {
    class Response
    {
        private $code = 0;

        public function setCode($code)
        {
            $this->code = (int) $code;
        }

        public function getCode()
        {
            return $this->code;
        }

        public function sendResponse()
        {
            exit($this->code);
        }
    }
}

namespace Magento\Framework\App\Cache {
    class Manager
    {
        public function clean(array $types)
        {
            $log = getenv('DET_FAKE_CACHE_LOG');
            if (is_string($log) && $log !== '') {
                file_put_contents($log, json_encode($types) . "\n", FILE_APPEND);
            }
        }
    }
}

namespace Magento\Framework\ObjectManager {
    interface ConfigLoaderInterface
    {
        public function load($area);
    }

    class ConfigLoader implements ConfigLoaderInterface
    {
        public function load($area)
        {
            return [];
        }
    }

    class ObjectManager implements \Magento\Framework\ObjectManagerInterface
    {
        public function get($type)
        {
            if ($type === \Magento\Framework\ObjectManager\ConfigLoaderInterface::class) {
                return new ConfigLoader();
            }
            if ($type === \Magento\Framework\App\Cache\Manager::class) {
                return new \Magento\Framework\App\Cache\Manager();
            }
            throw new \RuntimeException('fake object manager: unsupported get(' . $type . ')');
        }

        public function create($type, array $arguments = [])
        {
            if ($type === \Magento\Cms\Model\ResourceModel\Page\CollectionFactory::class) {
                return new \Magento\Cms\Model\ResourceModel\Page\CollectionFactory();
            }
            if ($type === \Magento\Cms\Api\PageRepositoryInterface::class) {
                return new \Magento\Cms\Api\PageRepository();
            }
            if ($type === \Magento\Cms\Model\PageFactory::class) {
                return new \Magento\Cms\Model\PageFactory();
            }
            throw new \RuntimeException('fake object manager: unsupported create(' . $type . ')');
        }

        public function configure($config)
        {
        }
    }
}

namespace Magento\Cms\Model\ResourceModel\Page {
    class Collection implements \IteratorAggregate
    {
        private $filters = [];

        public function addFieldToFilter($field, $value)
        {
            $this->filters[$field] = $value;

            return $this;
        }

        public function getIterator(): \Traversable
        {
            $pages = [];
            $pagesFile = getenv('DET_FAKE_PAGES_JSON');
            $configured = is_string($pagesFile) && $pagesFile !== '' && is_file($pagesFile)
                ? json_decode((string) file_get_contents($pagesFile), true)
                : null;
            if (is_array($configured)) {
                foreach ($configured as $spec) {
                    if (isset($this->filters['identifier']) && $spec['identifier'] !== $this->filters['identifier']) {
                        continue;
                    }
                    $pages[] = new \Magento\Cms\Model\Page($spec);
                }
            }

            return new \ArrayIterator($pages);
        }
    }

    class CollectionFactory
    {
        public function create()
        {
            return new Collection();
        }
    }
}

namespace Magento\Cms\Model {
    class Page
    {
        private $data;

        public function __construct(array $data = [])
        {
            $this->data = $data;
        }

        public function getId()
        {
            return $this->data['id'] ?? 42;
        }

        public function getStoreId()
        {
            return $this->data['storeIds'] ?? [0];
        }

        public function setIdentifier($value)
        {
            $this->data['identifier'] = $value;

            return $this;
        }

        public function setStoreId($value)
        {
            $this->data['storeIds'] = $value;

            return $this;
        }

        public function setTitle($value)
        {
            $this->data['title'] = $value;

            return $this;
        }

        public function setContent($value)
        {
            $this->data['content'] = $value;

            return $this;
        }

        public function setIsActive($value)
        {
            $this->data['isActive'] = $value;

            return $this;
        }

        public function toArray()
        {
            return $this->data;
        }
    }

    class PageFactory
    {
        public function create()
        {
            return new Page();
        }
    }
}

namespace Magento\Cms\Api {
    interface PageRepositoryInterface
    {
        public function save($page);
    }

    class PageRepository implements PageRepositoryInterface
    {
        public function save($page)
        {
            $log = getenv('DET_FAKE_SAVE_LOG');
            if (is_string($log) && $log !== '') {
                file_put_contents($log, json_encode($page->toArray()) . "\n", FILE_APPEND);
            }

            return $page;
        }
    }
}
