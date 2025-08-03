import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';
// import sanitizeHtml from 'sanitize-html';
import MarkdownIt from 'markdown-it';
const parser = new MarkdownIt({ html: true, linkify: true });

export async function GET(context) {
	const posts = await getCollection('blog');
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: posts.map((post) => ({
			...post.data,
			link: `/blog/${post.id}/`,
			// content: sanitizeHtml(parser.render(post.body), {
			// 	allowedTags: sanitizeHtml.defaults.allowedTags.concat(['table', 'img']),
			// }),
			content: parser.render(post.body),
		})),
	});
}
