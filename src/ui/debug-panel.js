// Display and input bindings only. Every debug action is checked by the engine.
export function debugPanel(view, icon, escape, header) {
  const d = view.debug;
  return `<div class="dialog-inner">${header(d.label, "Diagnostics & practice")}
    <p class="dialog-copy">Inspect your colony here. Open a practice copy to test systems with admin controls. Your real colony stays saved and receives no debug changes.</p>
    <div class="debug-metrics">${d.rows.map(([label, value]) => `<div><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`).join("")}</div>
    <button class="secondary-button full" data-action="diagnostics-export">${icon("download", 16)} Export gameplay report</button>
    ${
      !d.active
        ? '<button class="primary-button full" data-action="practice-enter">Open practice copy</button>'
        : `
      <div class="practice-note">PRACTICE COPY · Separate save · No prestige or lineage awards</div>
      <div class="debug-actions">
        ${[0.1, 1, 10, 60].map((seconds) => `<button class="secondary-button" data-action="debug-step" data-value="${seconds}">Step ${seconds}s</button>`).join("")}
        ${[
          ["resources", "Fill stores & energy"],
          ["unlock", "Unlock all structures"],
          ["excavate", "Excavate queued tiles"],
          ["warning", "Start raid warning"],
          ["heal", "Heal colony"],
          ["clearEnemies", "Clear attackers"],
        ]
          .map(
            ([action, label]) =>
              `<button class="secondary-button" data-action="debug-command" data-value="${action}">${label}</button>`,
          )
          .join("")}
      </div>
      <div class="debug-form"><label for="debug-crew">Add 10 ants to</label><select id="debug-crew"><option value="food">Food crew</option><option value="dig">Dig crew</option><option value="warrior">Warriors</option></select><button class="secondary-button" data-action="debug-hatch">Add ants</button></div>
      <div class="debug-form"><label for="debug-enemy">Surface attacker</label><select id="debug-enemy">${d.enemyChoices.map((e) => `<option value="${e.key}">${escape(e.name)}</option>`).join("")}</select><button class="secondary-button" data-action="debug-spawn">Spawn</button></div>
      <div class="debug-actions"><button class="secondary-button" data-action="debug-command" data-value="defeat">End practice colony</button><button class="primary-button" data-action="practice-exit">Return to real colony</button></div>`
    }
    <p class="settings-info">Step controls advance the engine while this panel stays paused. Close the panel to use normal map controls. Reloading opens your real colony.</p>
  </div>`;
}
