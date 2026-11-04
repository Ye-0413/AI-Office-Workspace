/* Avatar style selection and a read-only gallery of the family materials. */
(function (root) {
  'use strict';
  root.OfficeAppearancePicker = Object.freeze({ create });
  function create({ container, onChange } = {}) {
    if (!container || !root.OfficeAgentAppearance) return null;
    const model = root.OfficeAgentAppearance, document = container.ownerDocument;
    const section = document.createElement('section');
    section.className = 'appearance-setting'; section.dataset.appearancePolicy = 'family-unique';
    section.setAttribute('aria-labelledby', 'appearance-title');
    const title = document.createElement('h3'); title.id = 'appearance-title';
    const note = document.createElement('p'); note.id = 'appearance-note';
    const styleLabel = document.createElement('label');
    styleLabel.className = 'appearance-style';
    const styleTitle = document.createElement('span');
    const style = document.createElement('select');
    style.id = 'setting-avatarStyle';
    const styleOptions = ['pixel', 'painted'].map(value => {
      const option = document.createElement('option');
      option.value = value; style.append(option);
      return option;
    });
    styleLabel.append(styleTitle, style);
    style.addEventListener('change', () => onChange?.(style.value));
    const gallery = document.createElement('div'); gallery.className = 'appearance-creatures';
    gallery.setAttribute('role', 'list'); gallery.setAttribute('aria-labelledby', title.id);
    gallery.setAttribute('aria-describedby', note.id);
    const cards = model.catalog.map(design => {
      const card = document.createElement('article'); card.className = 'appearance-card';
      card.dataset.appearancePreview = design.id; card.setAttribute('role', 'listitem');
      const preview = document.createElement('span');
      preview.className = 'appearance-preview appearance-pose-preview'; preview.setAttribute('aria-hidden', 'true');
      preview.dataset.pose = 'idle';
      const image = document.createElement('img');
      image.alt = ''; image.draggable = false;
      image.decoding = 'async'; image.width = 120; image.height = 80;
      image.style.width = (design.poseColumns * 100) + '%'; image.style.height = (design.poseRows * 100) + '%';
      preview.append(image);
      const copy = document.createElement('span'); copy.className = 'appearance-option-copy';
      const label = document.createElement('span'); label.className = 'appearance-option-label';
      const role = document.createElement('span'); role.className = 'appearance-option-role';
      const description = document.createElement('span'); description.className = 'appearance-option-description';
      copy.append(label, role, description); card.append(preview, copy); gallery.append(card);
      return { card, preview, image, label, role, description, design };
    });
    section.append(title, styleLabel, note, gallery);
    const sizeSetting = container.querySelector('.agent-size-setting');
    if (sizeSetting) sizeSetting.after(section); else container.append(section);
    const motionGallery = root.OfficeRepertoireGallery?.create({ container: section });
    function update({ avatarStyle = 'pixel', language = 'zh', reducedMotion = false, lowPower = false, hidden = false } = {}) {
      avatarStyle = root.OfficePublicArtwork?.normalizeStyle(avatarStyle) || 'pixel';
      motionGallery?.update({ avatarStyle, language, reducedMotion, lowPower, hidden });
      const english = language === 'en';
      const painted = avatarStyle === 'painted';
      title.textContent = painted ? (english ? 'Painted companions' : '手绘伙伴') : (english ? 'Pixel companions' : '像素伙伴');
      styleTitle.textContent = english ? 'Avatar style' : '头像风格';
      styleOptions[0].textContent = english ? 'Pixel' : '像素风';
      styleOptions[1].textContent = english ? 'Painted' : '手绘风';
      style.value = avatarStyle;
      note.textContent = english
        ? 'Main agents receive different random appearances. Helpers inherit their main agent’s appearance at a smaller size. More than five mains use colour variations.'
        : '主 Agent 随机分配不同角色；分身继承主身外观，体型更小。超过五位主 Agent 时，以不同配色区分。';
      for (const { card, preview, image, label, role, description, design } of cards) {
        const asset = root.OfficePublicArtwork?.design(design, avatarStyle).asset || design.asset;
        const src = '../assets/avatars/' + asset;
        if (image.getAttribute('src') !== src) image.src = src;
        preview.dataset.avatarStyle = avatarStyle;
        label.textContent = english ? design.labelEn : design.labelZh;
        role.textContent = english ? design.roleEn : design.roleZh;
        description.textContent = english ? design.descriptionEn : design.descriptionZh;
        card.setAttribute('aria-label', [label.textContent, role.textContent, description.textContent].join(' · '));
      }
    }
    update();
    return Object.freeze({ update, destroy() { motionGallery?.destroy(); section.remove(); } });
  }
})(typeof globalThis === 'object' ? globalThis : this);
