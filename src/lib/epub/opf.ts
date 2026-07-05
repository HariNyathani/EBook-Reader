import 'server-only';

import { XMLParser } from 'fast-xml-parser';
import { EpubParseError } from './errors';
import { validateZipEntryPath } from './validate';

// ============================================================================
// XML Parser Configuration — XXE-safe
// ============================================================================

/**
 * Shared XML parser configuration.
 *
 * Security (ISD §7.Z): External entities and DTD processing are DISABLED to
 * prevent XXE attacks. The parser does not load external resources.
 *
 * We use `ignoreAttributes: false` to access attributes (needed for manifest items),
 * but `processEntities: false` prevents entity injection (XXE defense).
 */
function createSafeXmlParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false, // ISD §7.Z — disable entity processing (XXE defense)
    parseTagValue: true,
    trimValues: true,
    // Namespace handling: we need to match dc:title, dc:creator etc.
    // fast-xml-parser preserves the prefix when removeNSPrefix is false.
    removeNSPrefix: false,
  });
}

// ============================================================================
// Types
// ============================================================================

export interface ContainerInfo {
  /** Relative path to the OPF file from the EPUB root. */
  opfPath: string;
}

export interface OpfInfo {
  /** Book title (may be empty string if not found — caller should fallback). */
  title: string;
  /** Book author (null if not found). */
  author: string | null;
  /** Relative href of the cover image from the OPF directory (undefined if no cover found). */
  coverHref?: string;
}

// ============================================================================
// container.xml Parsing
// ============================================================================

/**
 * Parses META-INF/container.xml to find the OPF file path.
 *
 * Expected format:
 * ```xml
 * <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
 *   <rootfiles>
 *     <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
 *   </rootfiles>
 * </container>
 * ```
 *
 * @param xml - Raw XML string of container.xml
 * @throws {EpubParseError} if the OPF path cannot be resolved
 */
export function parseContainer(xml: string): ContainerInfo {
  const parser = createSafeXmlParser();

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch (err) {
    throw new EpubParseError('Failed to parse container.xml: malformed XML', err);
  }

  // Navigate: container > rootfiles > rootfile
  const container = parsed['container'] as Record<string, unknown> | undefined;
  if (!container) {
    throw new EpubParseError('container.xml missing <container> root element');
  }

  const rootfiles = container['rootfiles'] as Record<string, unknown> | undefined;
  if (!rootfiles) {
    throw new EpubParseError('container.xml missing <rootfiles> element');
  }

  const rootfile = rootfiles['rootfile'] as
    Record<string, unknown> | Record<string, unknown>[] | undefined;
  if (!rootfile) {
    throw new EpubParseError('container.xml missing <rootfile> element');
  }

  // Handle single rootfile or array of rootfiles — take the first with OEBPS media type
  const rootfilesArray = Array.isArray(rootfile) ? rootfile : [rootfile];

  for (const rf of rootfilesArray) {
    const fullPath = rf['@_full-path'] as string | undefined;
    const mediaType = rf['@_media-type'] as string | undefined;

    if (fullPath && mediaType === 'application/oebps-package+xml') {
      const opfPath = validateZipEntryPath(fullPath);
      return { opfPath };
    }
  }

  // Fallback: if no media-type match, take the first rootfile with a full-path
  for (const rf of rootfilesArray) {
    const fullPath = rf['@_full-path'] as string | undefined;
    if (fullPath) {
      const opfPath = validateZipEntryPath(fullPath);
      return { opfPath };
    }
  }

  throw new EpubParseError('container.xml does not resolve to any OPF file');
}

// ============================================================================
// OPF Parsing
// ============================================================================

/**
 * Normalizes a path relative to a base directory.
 *
 * @param baseDir - Directory of the OPF file (e.g. "OEBPS" or "" for root)
 * @param href - Relative href from the OPF
 * @returns Normalized zip entry path
 */
function resolveRelativePath(baseDir: string, href: string): string {
  if (!baseDir || baseDir === '') return validateZipEntryPath(href);

  const combined = `${baseDir}/${href}`;
  // Normalize double slashes and resolve . and .. safely
  const parts = combined.split('/');
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return validateZipEntryPath(resolved.join('/'));
}

/**
 * Gets the directory portion of a path. Returns '' for root-level files.
 *
 * @param filePath - e.g. "OEBPS/content.opf" → "OEBPS"
 */
function getDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : '';
}

/**
 * Safely extracts a text value from a parsed XML node.
 * Handles both string values and objects with #text property.
 */
function extractTextValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text']);
  }
  return '';
}

/**
 * Parses an OPF file to extract title, author, and cover image reference.
 *
 * Cover detection (in order):
 * 1. EPUB2: <meta name="cover" content="cover-image-id"/> → manifest item with that id
 * 2. EPUB3: manifest item with properties="cover-image"
 *
 * @param xml - Raw XML string of the OPF file
 * @param opfPath - Full path of the OPF within the zip (used to resolve relative cover hrefs)
 * @throws {EpubParseError} if the XML is malformed
 */
export function parseOpf(xml: string, opfPath: string): OpfInfo {
  const parser = createSafeXmlParser();

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch (err) {
    throw new EpubParseError('Failed to parse OPF: malformed XML', err);
  }

  const opf = parsed['package'] as Record<string, unknown> | undefined;
  if (!opf) {
    throw new EpubParseError('OPF missing <package> root element');
  }

  // --- Extract metadata ---
  const metadata = opf['metadata'] as Record<string, unknown> | undefined;
  let title = '';
  let author: string | null = null;

  if (metadata) {
    // dc:title
    const dcTitle = metadata['dc:title'] ?? metadata['title'];
    if (dcTitle) {
      const titleText = Array.isArray(dcTitle)
        ? extractTextValue(dcTitle[0])
        : extractTextValue(dcTitle);
      title = titleText.trim();
    }

    // dc:creator — use the first one (ISD §7.BB edge case: multiple creators → first)
    const dcCreator = metadata['dc:creator'] ?? metadata['creator'];
    if (dcCreator) {
      const creatorValue = Array.isArray(dcCreator) ? dcCreator[0] : dcCreator;
      const creatorText = extractTextValue(creatorValue).trim();
      if (creatorText) {
        author = creatorText;
      }
    }
  }

  // --- Extract cover from manifest ---
  const manifest = opf['manifest'] as Record<string, unknown> | undefined;
  let coverHref: string | undefined;

  if (manifest) {
    const items = manifest['item'];
    if (items) {
      const itemsArray = Array.isArray(items) ? items : [items];

      // Strategy 1: EPUB2 <meta name="cover" content="ID">
      if (metadata) {
        const metaItems = metadata['meta'];
        if (metaItems) {
          const metasArray = Array.isArray(metaItems) ? metaItems : [metaItems];
          for (const m of metasArray) {
            const metaObj = m as Record<string, unknown>;
            if (metaObj['@_name'] === 'cover' && typeof metaObj['@_content'] === 'string') {
              const coverId = metaObj['@_content'] as string;
              // Find manifest item with matching id
              const matchItem = itemsArray.find(
                (item) => (item as Record<string, unknown>)['@_id'] === coverId,
              ) as Record<string, unknown> | undefined;
              if (matchItem && typeof matchItem['@_href'] === 'string') {
                coverHref = matchItem['@_href'] as string;
                break;
              }
            }
          }
        }
      }

      // Strategy 2: EPUB3 manifest item with properties="cover-image"
      if (!coverHref) {
        const coverItem = itemsArray.find(
          (item) => (item as Record<string, unknown>)['@_properties'] === 'cover-image',
        ) as Record<string, unknown> | undefined;
        if (coverItem && typeof coverItem['@_href'] === 'string') {
          coverHref = coverItem['@_href'] as string;
        }
      }
    }
  }

  // Resolve cover href relative to the OPF directory
  const opfDir = getDirectory(opfPath);
  let resolvedCoverHref: string | undefined;
  if (coverHref) {
    try {
      resolvedCoverHref = resolveRelativePath(opfDir, coverHref);
    } catch {
      // Path traversal or other validation failure — drop cover gracefully
      resolvedCoverHref = undefined;
    }
  }

  return {
    title,
    author,
    coverHref: resolvedCoverHref,
  };
}
