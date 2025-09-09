import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { ensurePermissions } from '../utils/guards.js';

function formatUptime(sec) {
    const s = Math.floor(sec % 60);
    const m = Math.floor((sec / 60) % 60);
    const h = Math.floor((sec / 3600) % 24);
    const d = Math.floor(sec / 86400);
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

export default {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('봇 헬스체크 (지연시간/업타임)')
    ,
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;

        const start = Date.now();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const wsPing = Math.round(interaction.client.ws.ping);
        const roundTrip = Date.now() - start;
        const uptime = formatUptime(process.uptime());

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🏥 Health Check')
            .addFields(
                { name: 'WS Ping', value: `${wsPing}ms`, inline: true },
                { name: 'RTT', value: `${roundTrip}ms`, inline: true },
                { name: 'Uptime', value: uptime, inline: true },
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

