/**
 * dsh-skin-switcher — browser half.
 *
 * A small always-on floating pill (女仆 / 虎鲸 / 默认) that POSTs to the
 * host route /skin-switcher and reloads the page once the patch HMR has
 * recomposed the tree, so the chosen skin (or the default theme) appears.
 */
window.__ModuleLoader__.load({
	id: '@dsh-external/dsh-skin-switcher',
	factory: function (require) {
		var module = { exports: {} };
		var exports = module.exports;

		var ROOT = '/skin-switcher';

		function toast(message) {
			var el = document.createElement('div');
			el.textContent = message;
			el.style.cssText =
				'position:fixed;right:16px;bottom:64px;z-index:2147483000;' +
				'background:rgba(15,20,40,.92);color:#fff;padding:8px 14px;border-radius:8px;' +
				'font:12px/1.5 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);' +
				'pointer-events:none;transition:opacity .3s;';
			document.body.appendChild(el);
			setTimeout(function () { el.style.opacity = '0'; }, 1800);
			setTimeout(function () { el.remove(); }, 2300);
		}

		function switchTo(target, label) {
			fetch(ROOT, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ target: target }),
			})
				.then(function (r) { return r.json(); })
				.then(function (json) {
					if (!json.ok) {
						toast('切换失败: ' + (json.error || 'unknown'));
						return;
					}
					toast('已切换到 ' + label + '，正在刷新…');
					setTimeout(function () { location.reload(); }, 600);
				})
				.catch(function (e) { toast('切换失败: ' + e.message); });
		}

		function apply() {
			if (document.documentElement.dataset.dshSkinSwitcher === '1') return;
			document.documentElement.dataset.dshSkinSwitcher = '1';

			var panel = document.createElement('div');
			panel.style.cssText =
				'position:fixed;right:14px;bottom:14px;z-index:2147483000;' +
				'display:flex;flex-direction:column;gap:6px;align-items:flex-end;' +
				'font:12px/1 system-ui,sans-serif;';

			var row = document.createElement('div');
			row.style.cssText =
				'display:flex;gap:6px;align-items:center;' +
				'background:rgba(255,255,255,.92);border:1px solid rgba(30,45,90,.25);' +
				'border-radius:999px;padding:5px 8px;box-shadow:0 4px 16px rgba(0,0,0,.18);';

			function button(label, target) {
				var b = document.createElement('button');
				b.textContent = label;
				b.type = 'button';
				b.style.cssText =
					'border:0;border-radius:999px;padding:4px 10px;cursor:pointer;' +
					'background:#eef2fb;color:#1a2b5e;font:inherit;transition:background .15s;';
				b.onmouseenter = function () { b.style.background = '#dbe4f7'; };
				b.onmouseleave = function () { b.style.background = '#eef2fb'; };
				b.onclick = function () {
					b.disabled = true;
					b.style.opacity = '.55';
					switchTo(target, label);
				};
				return b;
			}

			row.append(button('女仆', 'maid-atelier'), button('虎鲸', 'orca-link'), button('默认', 'default'));
			panel.append(row);
			document.body.appendChild(panel);
		}

		exports.apply = apply;
		return module.exports;
	},
});
