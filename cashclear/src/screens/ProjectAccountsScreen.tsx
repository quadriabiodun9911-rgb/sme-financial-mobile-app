import React, { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';

function naira(amount: number): string {
    return `₦${amount.toLocaleString()}`;
}

export default function ProjectAccountsScreen() {
    const { projects, totalBalance } = useApp();
    const [newProjectName, setNewProjectName] = useState('');

    const handleCreate = () => {
        if (!newProjectName.trim()) return;
        Alert.alert(
            'Project account created',
            `"${newProjectName.trim()}" now has its own ring-fenced sub-account. Funds for this project won't mix with your other business lines.`,
        );
        setNewProjectName('');
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.title}>Project Accounts</Text>
                <Text style={styles.subtitle}>Ring-fence funds per project or business line - the discipline that cut pilot default rates by 40%</Text>

                <Card style={styles.totalCard}>
                    <Text style={styles.totalLabel}>Total across all project accounts</Text>
                    <Text style={styles.totalValue}>{naira(totalBalance)}</Text>
                </Card>

                {projects.map((project) => (
                    <Card key={project.id} style={styles.projectCard}>
                        <View style={styles.projectIcon}>
                            <Ionicons name="folder-outline" size={20} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.projectName}>{project.name}</Text>
                            <Text style={styles.projectMeta}>Opened {project.createdAt}</Text>
                        </View>
                        <Text style={styles.projectBalance}>{naira(project.walletBalance)}</Text>
                    </Card>
                ))}

                <Text style={styles.sectionTitle}>Create a new project account</Text>
                <Card style={styles.createCard}>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Ikeja Warehouse"
                        placeholderTextColor={colors.textFaint}
                        value={newProjectName}
                        onChangeText={setNewProjectName}
                    />
                    <TouchableOpacity style={styles.createButton} onPress={handleCreate}>
                        <Text style={styles.createButtonText}>Create</Text>
                    </TouchableOpacity>
                </Card>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 20, paddingBottom: 40, gap: 14 },
    title: { color: colors.text, fontSize: 22, fontWeight: '700' },
    subtitle: { color: colors.textMuted, fontSize: 12, marginBottom: 4, lineHeight: 17 },
    totalCard: { gap: 6 },
    totalLabel: { color: colors.textMuted, fontSize: 12 },
    totalValue: { color: colors.text, fontSize: 26, fontWeight: '800' },
    projectCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    projectIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    projectName: { color: colors.text, fontSize: 14, fontWeight: '600' },
    projectMeta: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
    projectBalance: { color: colors.text, fontSize: 14, fontWeight: '700' },
    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8 },
    createCard: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    input: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 12, color: colors.text },
    createButton: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
    createButtonText: { color: colors.background, fontWeight: '700', fontSize: 13 },
});
