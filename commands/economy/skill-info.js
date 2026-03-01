const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");
const skillsConfig = require('../../json/skills-config.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';

const SKILL_TIPS = new Map([
    ['skill_healing', 'استخدمها عندما تكون صحتك منخفضة، فهي تستعيد نسبة من طاقتك الكاملة.'],
    ['skill_shielding', 'استخدمها قبل أن تتلقى هجوماً قوياً من الخصم لتقليل الضرر بشكل كبير.'],
    ['skill_buffing', 'استخدمها قبل هجومك التالي مباشرة لمضاعفة الضرر الذي تسببه.'],
    ['skill_rebound', 'فعّلها عندما تتوقع هجوماً قوياً لتعكس جزءاً كبيراً من الضرر إلى الخصم.'],
    ['skill_weaken', 'استخدمها على الخصم لتقليل ضرر هجومه القادم وحماية نفسك.'],
    ['skill_dispel', 'استخدمها إذا كان خصمك يستخدم "درع" أو "تعزيز" لإزالة تأثيراتها عنه.'],
    ['skill_cleanse', 'استخدمها لإزالة التأثيرات السلبية عنك مثل "السم" أو "الإضعاف".'],
    ['skill_poison', 'استخدمها في بداية القتال. تسبب ضرراً بسيطاً فورياً، وضرر مستمر كل دور.'],
    ['skill_gamble', 'للمخاطرين فقط! قد تسبب ضرراً هائلاً، أو ضرراً ضعيفاً جداً. تعتمد على الحظ.'],
    ['race_dragon_skill', 'هجوم ناري قوي يسبب ضرراً حقيقياً يتجاهل أي درع لدى الخصم.'],
    ['race_human_skill', 'مهارة دفاعية وهجومية. تمنحك درعاً وتعزيزاً للضرر في نفس الوقت.'],
    ['race_seraphim_skill', 'هجوم يسرق الحياة. يسبب ضرراً للخصم ويعالجك بنسبة 10% من صحتك الكاملة.'],
    ['race_demon_skill', 'هجوم انتحاري. يسبب ضرراً هائلاً للخصم، لكنه يخصم 10% من صحتك الحالية.'],
    ['race_elf_skill', 'هجوم سريع يضرب مرتين متتاليتين، مسبباً ضرراً مزدوجاً في دور واحد.'],
    ['race_dark_elf_skill', 'يسبب ضرراً فورياً ويضع أقوى سم في اللعبة على الخصم.'],
    ['race_vampire_skill', 'هجوم يسرق الحياة بناءً على الضرر المُسبب. كلما كان هجومك أقوى، زاد شفاؤك.'],
    ['race_hybrid_skill', 'مهارة متقلبة. تمنحك تأثير عشوائي (درع، أو تعزيز، أو شفاء).'],
    ['race_spirit_skill', 'يسمح لهجومك القادم باختراق أي درع يمتلكه الخصم.'],
    ['race_dwarf_skill', 'يمنحك درعاً قوياً جداً يقلل الضرر بنسبة كبيرة، لكنه يستهلك دورك (لا يمكنك الهجوم).'],
    ['race_ghoul_skill', 'هجوم متوسط يلحق ضرراً بالخصم ويقوم بإضعافه في نفس الوقت.']
]);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('مهارة')
        .setDescription('يعرض شرحاً تفصيلياً ونصيحة لاستخدام مهارة معينة.')
        .addStringOption(option =>
            option.setName('اسم-المهارة')
            .setDescription('اسم المهارة التي تريد البحث عنها')
            .setRequired(true)
            .setAutocomplete(true)),

    name: 'skill-info',
    aliases: ['مهارة', 'شرح-مهارة'],
    category: "Economy",
    description: 'يعرض شرحاً تفصيلياً ونصيحة لاستخدام مهارة معينة.',

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const filtered = skillsConfig.filter(s => 
            s.name.toLowerCase().includes(focusedValue) || 
            s.id.toLowerCase().includes(focusedValue)
        );

        await interaction.respond(
            filtered.slice(0, 25).map(s => ({
                name: `${s.emoji || '✨'} ${s.name}`,
                value: s.id
            }))
        );
    },

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message;
        let skillQuery;

        if (isSlash) {
            interaction = interactionOrMessage;
            skillQuery = interaction.options.getString('اسم-المهارة').toLowerCase();
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            if (!args.length) {
                return message.reply('**الاستخدام:** `-مهارة <اسم المهارة>`\n**مثال:** `-مهارة شفاء`');
            }
            skillQuery = args.join(' ').toLowerCase();
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const replyError = async (content) => {
            if (isSlash) {
                return interaction.editReply({ content, ephemeral: true });
            } else {
                return message.reply(content);
            }
        };

        const skill = skillsConfig.find(s => 
            s.id.toLowerCase() === skillQuery ||
            s.name.toLowerCase().includes(skillQuery)
        );

        if (!skill) {
            return replyError('❌ لم أتمكن من العثور على مهارة بهذا الاسم. جرب كتابة الاسم العربي (مثل: شفاء).');
        }

        const tip = SKILL_TIPS.get(skill.id) || "لا توجد نصيحة خاصة لهذه المهارة.";
        const isRaceSkill = skill.id.startsWith('race_');

        const embed = new EmbedBuilder()
            .setTitle(`${skill.emoji} ${skill.name} ${isRaceSkill ? '(خاص بالعرق)' : ''}`)
            .setColor(isRaceSkill ? Colors.Blue : Colors.Gold)
            .addFields(
                { name: "✶ الـوصـف", value: skill.description || "لا يوجد وصف." },
                { name: "✥ نصيحة للاستعمال", value: tip }
            );

        await reply({ embeds: [embed] });
    }
};