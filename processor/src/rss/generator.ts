/**
 * RSS feed generator
 * Creates and updates podcast RSS feed with episode metadata
 */

import type { Config, EpisodeMetadata } from '@briefcast/shared';
import { STORAGE_KEYS } from '@briefcast/shared';
import type { R2StorageClient } from '../storage/r2-client.js';

/**
 * RSS generator options
 */
export interface RSSGeneratorOptions {
  maxEpisodes?: number;
}

const DEFAULT_OPTIONS: Required<RSSGeneratorOptions> = {
  maxEpisodes: 100,
};

/**
 * RSS feed generator class
 */
export class RSSGenerator {
  private readonly config: Config;
  private readonly r2Client: R2StorageClient;

  constructor(config: Config, r2Client: R2StorageClient) {
    this.config = config;
    this.r2Client = r2Client;
  }

  /**
   * Generate RSS feed from episodes
   */
  async generateFeed(
    episodes: EpisodeMetadata[],
    options: RSSGeneratorOptions = {}
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const podcast = this.config.podcast;

    // Sort episodes by date (newest first)
    const sortedEpisodes = [...episodes].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Limit to max episodes
    const limitedEpisodes = sortedEpisodes.slice(0, opts.maxEpisodes);

    // Build RSS feed
    const items = limitedEpisodes.map((ep, i) => this.buildItem(ep, i + 1));

    // Derive feedUrl from siteUrl if not explicitly set
    const feedUrl = `${podcast.siteUrl}/feed.xml`;

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(podcast.title)}</title>
    <link>${escapeXml(podcast.siteUrl)}</link>
    <description>${escapeXml(podcast.description)}</description>
    <language>${podcast.language}</language>
    <copyright>${escapeXml(podcast.copyright)}</copyright>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>

    <itunes:author>${escapeXml(podcast.author)}</itunes:author>
    <itunes:summary>${escapeXml(podcast.description)}</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="${escapeXml(podcast.imageUrl)}"/>
    <itunes:category text="${escapeXml(podcast.category)}">
      ${podcast.subcategory ? `<itunes:category text="${escapeXml(podcast.subcategory)}"/>` : ''}
    </itunes:category>
    <itunes:owner>
      <itunes:name>${escapeXml(podcast.author)}</itunes:name>
      <itunes:email>${escapeXml(podcast.email)}</itunes:email>
    </itunes:owner>

    <image>
      <url>${escapeXml(podcast.imageUrl)}</url>
      <title>${escapeXml(podcast.title)}</title>
      <link>${escapeXml(podcast.siteUrl)}</link>
    </image>

${items.join('\n')}
  </channel>
</rss>`;

    return rss;
  }

  /**
   * Build RSS item for an episode
   */
  private buildItem(episode: EpisodeMetadata, episodeNumber: number): string {
    const pubDate = new Date(episode.date + 'T08:00:00Z').toUTCString();
    const duration = formatDuration(episode.durationSeconds);
    const feedUrl = `${this.config.podcast.siteUrl}/feed.xml`;
    const guid = `${feedUrl}#${episode.id}`;

    // Build description with sources
    const description = episode.sources.length > 0
      ? `${episode.description}\n\nSources: ${episode.sources.join(', ')}`
      : episode.description;

    return `    <item>
      <title>${escapeXml(episode.title)}</title>
      <description>${escapeXml(description)}</description>
      <content:encoded><![CDATA[${episode.description}${episode.sources.length > 0 ? `<br/><br/><strong>Sources:</strong><ul>${episode.sources.map((s: string) => `<li>${s}</li>`).join('')}</ul>` : ''}]]></content:encoded>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${escapeXml(episode.audioUrl)}" length="${episode.fileSizeBytes}" type="audio/mpeg"/>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <link>${escapeXml(this.config.podcast.siteUrl)}</link>
      <itunes:title>${escapeXml(episode.title)}</itunes:title>
      <itunes:summary>${escapeXml(episode.description)}</itunes:summary>
      <itunes:duration>${duration}</itunes:duration>
      <itunes:episode>${episodeNumber}</itunes:episode>
      <itunes:explicit>false</itunes:explicit>
    </item>`;
  }

  /**
   * Save RSS feed to R2
   */
  async saveFeed(feedXml: string): Promise<void> {
    await this.r2Client.putObject(
      STORAGE_KEYS.RSS_FEED,
      feedXml,
      'application/rss+xml'
    );
  }

  /**
   * Load existing RSS feed from R2
   */
  async loadExistingFeed(): Promise<string | null> {
    try {
      return await this.r2Client.getObjectText(STORAGE_KEYS.RSS_FEED);
    } catch {
      return null;
    }
  }

  /**
   * Add episode and update RSS feed
   */
  async addEpisodeToFeed(episode: EpisodeMetadata): Promise<string> {
    // Load existing episodes from metadata
    const existingMetadata = await this.loadEpisodeMetadata();

    // Add new episode
    const allEpisodes = [episode, ...existingMetadata];

    // Generate new feed
    const feedXml = await this.generateFeed(allEpisodes);

    // Save feed
    await this.saveFeed(feedXml);

    // Save episode metadata
    await this.saveEpisodeMetadata(episode);

    return feedXml;
  }

  /**
   * Load all episode metadata from R2
   */
  async loadEpisodeMetadata(): Promise<EpisodeMetadata[]> {
    try {
      const keys = await this.r2Client.listObjectKeys(STORAGE_KEYS.METADATA_PREFIX);
      const episodes: EpisodeMetadata[] = [];

      for (const key of keys) {
        if (key.endsWith('.json')) {
          try {
            const metadata = await this.r2Client.getObjectJson<EpisodeMetadata>(key);
            episodes.push(metadata);
          } catch {
            // Skip invalid metadata files
          }
        }
      }

      return episodes;
    } catch {
      return [];
    }
  }

  /**
   * Save episode metadata to R2
   */
  async saveEpisodeMetadata(episode: EpisodeMetadata): Promise<void> {
    const key = `${STORAGE_KEYS.METADATA_PREFIX}${episode.id}.json`;
    await this.r2Client.putObjectJson(key, episode);
  }

  /**
   * Regenerate full RSS feed from all metadata
   */
  async regenerateFeed(): Promise<string> {
    const episodes = await this.loadEpisodeMetadata();
    const feedXml = await this.generateFeed(episodes);
    await this.saveFeed(feedXml);
    return feedXml;
  }
}

/**
 * Create RSS generator from config
 */
export function createRSSGenerator(
  config: Config,
  r2Client: R2StorageClient
): RSSGenerator {
  return new RSSGenerator(config, r2Client);
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format duration as HH:MM:SS
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
