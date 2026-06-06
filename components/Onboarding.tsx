import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Dimensions } from 'react-native';

interface OnboardingSlide {
    id: string;
    title: string;
    description: string;
    icon: string;
}

interface OnboardingProps {
    onComplete: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isComplete, setIsComplete] = useState(false);

    const slides: OnboardingSlide[] = [
        {
            id: '1',
            title: 'Welcome to FinanceBook',
            description: 'Your comprehensive SME financial management solution. Track income, expenses, and cash flow all in one place.',
            icon: '💼'
        },
        {
            id: '2',
            title: 'Real-Time Insights',
            description: 'Get instant access to key financial metrics including profit margins, cash reserves, and debt ratios.',
            icon: '📊'
        },
        {
            id: '3',
            title: 'Forecast & Plan',
            description: 'Predict future cash flows and make informed decisions with our forecasting tools.',
            icon: '🔮'
        },
        {
            id: '4',
            title: 'Start Managing',
            description: 'Begin tracking your business finances today to build a stronger financial foundation.',
            icon: '🚀'
        }
    ];

    const nextSlide = () => {
        if (currentSlide < slides.length - 1) {
            setCurrentSlide(currentSlide + 1);
        } else {
            finishOnboarding();
        }
    };

    const prevSlide = () => {
        if (currentSlide > 0) {
            setCurrentSlide(currentSlide - 1);
        }
    };

    const finishOnboarding = () => {
        setIsComplete(true);
        onComplete();
    };

    const goToSlide = (index: number) => {
        setCurrentSlide(index);
    };

    if (isComplete) return null;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => goToSlide(0)}>
                    <Text style={styles.skipButton}>Skip</Text>
                </TouchableOpacity>
                <View style={styles.indicatorContainer}>
                    {slides.map((_, index) => (
                        <TouchableOpacity
                            key={index}
                            style={[
                                styles.indicator,
                                index === currentSlide && styles.activeIndicator
                            ]}
                            onPress={() => goToSlide(index)}
                        />
                    ))}
                </View>
                <TouchableOpacity onPress={nextSlide}>
                    <Text style={styles.nextButton}>
                        {currentSlide === slides.length - 1 ? 'Get Started' : 'Next'}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <Text style={styles.icon}>{slides[currentSlide].icon}</Text>
                </View>
                <Text style={styles.title}>{slides[currentSlide].title}</Text>
                <Text style={styles.description}>{slides[currentSlide].description}</Text>
            </View>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.navButton, currentSlide === 0 && styles.hidden]}
                    onPress={prevSlide}
                    disabled={currentSlide === 0}
                >
                    <Text style={styles.navButtonText}>Previous</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={nextSlide}
                >
                    <Text style={styles.primaryButtonText}>
                        {currentSlide === slides.length - 1 ? 'Get Started' : 'Continue'}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a',
        padding: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    skipButton: {
        color: '#94a3b8',
        fontSize: 16,
        fontWeight: '500',
    },
    indicatorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    indicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#334155',
        marginHorizontal: 4,
    },
    activeIndicator: {
        backgroundColor: '#3b82f6',
        width: 24,
    },
    nextButton: {
        color: '#3b82f6',
        fontSize: 16,
        fontWeight: '500',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 32,
    },
    icon: {
        fontSize: 60,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#f8fafc',
        textAlign: 'center',
        marginBottom: 16,
    },
    description: {
        fontSize: 16,
        color: '#94a3b8',
        textAlign: 'center',
        lineHeight: 24,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 32,
    },
    navButton: {
        backgroundColor: '#334155',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        minWidth: 80,
    },
    hidden: {
        opacity: 0,
    },
    navButtonText: {
        color: '#f8fafc',
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'center',
    },
    primaryButton: {
        backgroundColor: '#3b82f6',
        flex: 1,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        marginLeft: 16,
    },
    primaryButtonText: {
        color: '#f8fafc',
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'center',
    },
});

export default Onboarding;