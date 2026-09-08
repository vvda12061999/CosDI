'use strict';

exports.template = /* html */ `
<section class="cosdi-diagnostics">
  <header>
    <h2>CosDI Diagnostics</h2>
    <button class="refresh">Refresh</button>
  </header>
  <p class="hint">Enter preview/play so LifetimeScope can publish registration traces. Then click Refresh.</p>
  <div class="content"></div>
</section>
`;

exports.style = /* css */ `
.cosdi-diagnostics {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
  color: var(--color-normal-contrast, #ccc);
  font-family: 'Segoe UI', sans-serif;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
h2 {
  margin: 0;
  font-size: 16px;
}
.refresh {
  cursor: pointer;
}
.hint {
  margin: 0 0 12px;
  opacity: 0.75;
  font-size: 12px;
}
.content {
  flex: 1;
  overflow: auto;
}
.scope {
  border: 1px solid var(--color-default-border, #444);
  border-radius: 6px;
  margin-bottom: 10px;
  padding: 8px 10px;
}
.scope h3 {
  margin: 0 0 8px;
  font-size: 13px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th, td {
  text-align: left;
  padding: 4px 6px;
  border-bottom: 1px solid var(--color-default-border, #333);
}
.empty {
  opacity: 0.7;
  font-size: 12px;
}
`;

exports.$ = {
    refresh: '.refresh',
    content: '.content',
};

exports.ready = function () {
    const refresh = async () => {
        let data = { scopes: [], empty: true };
        try {
            const result = await Editor.Message.request('scene', 'execute-scene-script', {
                name: 'cosdi',
                method: 'getDiagnostics',
                args: [],
            });
            if (result) {
                data = result;
            }
        } catch (error) {
            data = { scopes: [], error: String(error) };
        }

        const content = this.$.content;
        if (!data.scopes || data.scopes.length === 0) {
            const message = data.error
                ? `Could not read diagnostics: ${data.error}`
                : 'No scopes collected yet. Play the scene with a LifetimeScope, then refresh.';
            content.innerHTML = `<p class="empty">${message}</p>`;
            return;
        }

        content.innerHTML = data.scopes.map((scope) => {
            const rows = (scope.registrations || []).map((reg) => `
                <tr>
                    <td>${escapeHtml(reg.type)}</td>
                    <td>${escapeHtml(reg.lifetime)}</td>
                    <td>${reg.refCount}</td>
                    <td>${Number(reg.resolveTime).toFixed(2)} ms</td>
                    <td>${reg.instanceCount}</td>
                    <td>${escapeHtml((reg.dependencies || []).join(', '))}</td>
                </tr>
            `).join('');
            return `
                <article class="scope">
                    <h3>${escapeHtml(scope.scopeName)}</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Lifetime</th>
                                <th>Resolves</th>
                                <th>Time</th>
                                <th>Instances</th>
                                <th>Dependencies</th>
                            </tr>
                        </thead>
                        <tbody>${rows || '<tr><td colspan="6">No registrations</td></tr>'}</tbody>
                    </table>
                </article>
            `;
        }).join('');
    };

    this.$.refresh.addEventListener('click', () => refresh());
    refresh();
};

exports.close = function () {};

exports.methods = {};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
