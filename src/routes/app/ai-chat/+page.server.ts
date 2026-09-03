import { requireAdmin } from '$lib/server/guard';

const PATH = '/app/ai-chat';

export const load = async ({ locals }) => {
	const user = requireAdmin(locals.user, PATH);
	return { user: { name: user.name } };
};
