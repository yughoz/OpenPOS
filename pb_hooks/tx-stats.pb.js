/**
 * Endpoint agregat untuk halaman transaksi, laporan penjualan, dan dashboard.
 *
 * Alasan endpoint ini ada: list API PocketBase menghitung ulang SELURUH
 * agregasi setiap permintaan halaman (filter tidak bisa push-down ke dalam
 * view), sehingga rentang besar memakan puluhan detik. Di sini agregasi
 * dijalankan sebagai satu SQL dengan filter push-down + index, jadi selalu
 * satu respons kecil tanpa pagination.
 *
 * Catatan JSVM: dbx Query.all/one butuh dest pointer — pakai
 * arrayOf(new DynamicModel({...})) dengan tipe awal per kolom
 * (string "" vs angka 0) agar scan hasil benar.
 *
 * Auth: semua user login (sama seperti rule list collections lain); scoping
 * kasir ditegakkan sisi aplikasi lewat param `user`. Param tanggal hanya
 * diterima dalam format YYYY-MM-DD dan dikirim sebagai bound parameter.
 */
routerAdd('GET', '/api/pos/tx-stats', (e) => {
	var q = e.request.url.query();
	var mode = q.get('mode') || 'summary';
	var from = q.get('from') || '';
	var to = q.get('to') || '';

	var cond = ["t.status = 'completed'"];
	var params = {};
	if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
		cond.push('t.transaction_date >= {:from}');
		params.from = from + ' 00:00:00';
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
		cond.push('t.transaction_date <= {:to}');
		params.to = to + ' 23:59:59';
	}
	var user = q.get('user') || '';
	if (user) {
		cond.push('t.user = {:user}');
		params.user = user;
	}
	var customer = q.get('customer') || '';
	if (customer) {
		cond.push('t.customer = {:customer}');
		params.customer = customer;
	}
	var where = cond.join(' AND ');

	if (mode === 'summary') {
		var head = new DynamicModel({ tx_count: 0, omzet: 0 });
		$app
			.db()
			.newQuery('SELECT COUNT(*) AS tx_count, COALESCE(SUM(t.total_final), 0) AS omzet FROM transactions t WHERE ' + where)
			.bind(params)
			.one(head);
		var modal = new DynamicModel({ modal: 0 });
		$app
			.db()
			.newQuery(
				'SELECT COALESCE(SUM(i.qty * i.cost_price), 0) AS modal FROM transaction_items i JOIN transactions t ON t.id = i."transaction" WHERE ' +
					where
			)
			.bind(params)
			.one(modal);
		return e.json(200, { tx_count: head.tx_count, omzet: head.omzet, modal: modal.modal });
	}

	if (mode === 'daily') {
		// modal dihitung dari snapshot cost_price per item (PRD F5.8)
		var rows = arrayOf(new DynamicModel({ day: '', tx_count: 0, omzet: 0, modal: 0 }));
		$app
			.db()
			.newQuery(
				'SELECT DATE(t.transaction_date) AS day, COUNT(*) AS tx_count, COALESCE(SUM(t.total_final), 0) AS omzet, ' +
					'COALESCE(SUM((SELECT COALESCE(SUM(i.qty * i.cost_price), 0) FROM transaction_items i WHERE i."transaction" = t.id)), 0) AS modal ' +
					'FROM transactions t WHERE ' + where + ' GROUP BY day ORDER BY day'
			)
			.bind(params)
			.all(rows);
		return e.json(200, rows);
	}

	if (mode === 'methods') {
		var rows = arrayOf(new DynamicModel({ payment_method: '', tx_count: 0, omzet: 0 }));
		$app
			.db()
			.newQuery(
				"SELECT COALESCE(t.payment_method, '') AS payment_method, COUNT(*) AS tx_count, COALESCE(SUM(t.total_final), 0) AS omzet " +
					'FROM transactions t WHERE ' + where + ' GROUP BY t.payment_method ORDER BY omzet DESC'
			)
			.bind(params)
			.all(rows);
		return e.json(200, rows);
	}

	if (mode === 'top-products') {
		var limit = parseInt(q.get('limit') || '10', 10);
		if (!limit || limit < 1) limit = 10;
		if (limit > 50) limit = 50;
		params.limit = limit;
		var rows = arrayOf(new DynamicModel({ product_name: '', qty: 0, omzet: 0, modal: 0 }));
		$app
			.db()
			.newQuery(
				"SELECT COALESCE(i.product_name, '') AS product_name, COALESCE(SUM(i.qty), 0) AS qty, " +
					'COALESCE(SUM(i.final_price), 0) AS omzet, COALESCE(SUM(i.qty * i.cost_price), 0) AS modal ' +
					'FROM transaction_items i JOIN transactions t ON t.id = i."transaction" WHERE ' + where +
					' GROUP BY i.product_name ORDER BY qty DESC LIMIT {:limit}'
			)
			.bind(params)
			.all(rows);
		return e.json(200, rows);
	}

	return e.json(400, { message: 'mode tidak dikenal' });
}, $apis.requireAuth());
