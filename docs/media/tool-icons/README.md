# README tool icons

28 self-contained, 72×72 SVG tiles matching [the provider registry](../../../agents/registry.js). Display at 36×36 pixels in the README. The light neutral tile keeps both monochrome and colored marks legible on light and dark pages.

18 brand marks come from [Lobe Icons](https://github.com/lobehub/lobe-icons), pinned to `@lobehub/icons-static-svg@1.95.0` under the [MIT license](LICENSE-Lobe-Icons.txt). Original icon paths, gradients, masks, and colors are retained; only the display viewport and neutral tile are added. The original white Kimi mark also has a dark inset backplate for contrast. Package integrity, original source URLs, source hashes, and output hashes are recorded in [manifest.json](manifest.json).

The remaining 10 tiles are project-authored neutral letter markers, explicitly marked `fallback: true`. They are not official product logos. The wrappers and letter markers are available under the [project AGPL-3.0-only license](../../../LICENSE). These documentation icons do not restore or redistribute restricted upstream avatars or mascots. Brand names and marks belong to their respective owners; their use identifies supported tools and does not imply affiliation or endorsement.

Rebuild from the repository root:

```sh
node office/scripts/promo/prepare-readme-tool-icons.cjs
```

The script downloads the pinned public SVG archive and license, verifies checksums, and reads image data only; it never installs or executes the npm package. SVG validation rejects scripts, event handlers, foreign objects, links, external resources, and unsupported elements.

中文：品牌图标来自固定版本的 MIT 许可 Lobe Icons，并保留许可证与来源记录。缺少明确品牌来源的 10 个工具使用自绘中性字母标识，不冒充官方 Logo；这些图标仅用于说明接入工具，不涉及恢复上游受限角色。
