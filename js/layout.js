// Layout = how the fields are arranged on the page (sections → groups → fields), separate from what
// each field does. Used by the layout editor (dev/editor.html) to preview a rearranged page live.
//
// layout = { sections: [{ id, title, intro, groups: [{ title, info, collapsed, fields: [{ id, label }] }] }],
//            hidden: [fieldId, …] }

// The layout the code currently has.
export function layoutFrom(SECTIONS) {
  return {
    sections: SECTIONS.map((s) => ({
      id: s.id, title: s.title, intro: s.intro || "",
      groups: s.groups.map((g) => ({
        title: g.title || "", info: g.info || "", collapsed: !!g.collapsed,
        fields: g.fields.map((f) => ({ id: f.id, label: f.label })),
      })),
    })),
    hidden: [],
  };
}

// Sections in the shape app.js renders, built from a layout. Unknown field ids are skipped.
export function applyLayout(layout, SECTIONS) {
  const byId = {};
  for (const s of SECTIONS) for (const g of s.groups) for (const f of g.fields) byId[f.id] = f;
  return layout.sections.map((s) => ({
    id: s.id, title: s.title, intro: s.intro || undefined,
    groups: s.groups.map((g) => ({
      title: g.title || undefined, info: g.info || undefined, collapsed: !!g.collapsed,
      fields: g.fields.filter((f) => byId[f.id]).map((f) => ({ ...byId[f.id], label: f.label || byId[f.id].label })),
    })),
  }));
}
