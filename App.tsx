import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  View,
  ScrollView,
  useWindowDimensions,
  TextInput,
  TextInputProps,
} from 'react-native';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useAnimatedProps,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import React, { useRef, useEffect, useState, useMemo } from 'react';

interface AnimatedTextInputProps extends TextInputProps {
  text: string;
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const GRID_SIZE = 25;
const CONTENT_WIDTH = 2000;
const CONTENT_HEIGHT = 2000;
const BOX_SIZE = 100;
const AUTO_SCROLL_THRESHOLD_PERCENTAGE = 0.15;
const AUTO_SCROLL_SPEED = 6;
const AUTO_SCROLL_INTERVAL = 16;

const GridBackground = () => {
  const lines = useMemo(() => {
    const horizontal = [];
    const vertical = [];

    for (let i = 0; i <= CONTENT_HEIGHT / GRID_SIZE; i++) {
      horizontal.push(
        <View
          key={`h-${i}`}
          style={[styles.gridLine, { top: i * GRID_SIZE, width: CONTENT_WIDTH }]}
        />
      );
    }

    for (let i = 0; i <= CONTENT_WIDTH / GRID_SIZE; i++) {
      vertical.push(
        <View
          key={`v-${i}`}
          style={[styles.gridLine, { left: i * GRID_SIZE, height: CONTENT_HEIGHT }]}
        />
      );
    }

    return [...horizontal, ...vertical];
  }, []);

  return <View style={styles.gridContainer}>{lines}</View>;
};

export default function App() {
  const dimensions = useWindowDimensions();
  const verticalScrollRef = useRef<ScrollView>(null);
  const horizontalScrollRef = useRef<ScrollView>(null);
  const scrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollDirectionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [boxPosition, setBoxPosition] = useState({ x: 0, y: 0 });

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const scrollX = useSharedValue(0);
  const dragStartScrollY = useSharedValue(0);
  const dragStartScrollX = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const centerX = (CONTENT_WIDTH - dimensions.width) / 2;
      const centerY = (CONTENT_HEIGHT - dimensions.height) / 2;

      horizontalScrollRef.current?.scrollTo({ x: centerX, animated: false });
      verticalScrollRef.current?.scrollTo({ y: centerY, animated: false });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (scrollTimerRef.current) {
        clearInterval(scrollTimerRef.current);
      }
    };
  }, [dimensions]);

  const snapToGrid = (value: number) => {
    'worklet';
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  };

  const startAutoScroll = (directionX: number, directionY: number) => {
    if (scrollTimerRef.current) {
      return;
    }

    scrollDirectionRef.current = { x: directionX, y: directionY };

    scrollTimerRef.current = setInterval(() => {
      const direction = scrollDirectionRef.current;

      if (direction.y !== 0) {
        const newScrollY = Math.max(
          0,
          Math.min(
            CONTENT_HEIGHT - dimensions.height,
            scrollY.value + direction.y * AUTO_SCROLL_SPEED
          )
        );

        if (newScrollY !== scrollY.value) {
          scrollY.value = newScrollY;
          verticalScrollRef.current?.scrollTo({ y: newScrollY, animated: false });
        }
      }

      if (direction.x !== 0) {
        const newScrollX = Math.max(
          0,
          Math.min(
            CONTENT_WIDTH - dimensions.width,
            scrollX.value + direction.x * AUTO_SCROLL_SPEED
          )
        );

        if (newScrollX !== scrollX.value) {
          scrollX.value = newScrollX;
          horizontalScrollRef.current?.scrollTo({ x: newScrollX, animated: false });
        }
      }
    }, AUTO_SCROLL_INTERVAL);
  };

  const stopAutoScroll = () => {
    if (scrollTimerRef.current) {
      clearInterval(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
    scrollDirectionRef.current = { x: 0, y: 0 };
  };

  const checkScrollEdge = (absoluteX: number, absoluteY: number) => {
    'worklet';
    const thresholdY = dimensions.height * AUTO_SCROLL_THRESHOLD_PERCENTAGE;
    const thresholdX = dimensions.width * AUTO_SCROLL_THRESHOLD_PERCENTAGE;

    const distanceFromTop = absoluteY - scrollY.value;
    const distanceFromBottom = scrollY.value + dimensions.height - absoluteY;
    const distanceFromLeft = absoluteX - scrollX.value;
    const distanceFromRight = scrollX.value + dimensions.width - absoluteX;

    let directionX = 0;
    let directionY = 0;

    if (distanceFromTop < thresholdY && scrollY.value > 0) {
      directionY = -1;
    } else if (
      distanceFromBottom < thresholdY &&
      scrollY.value < CONTENT_HEIGHT - dimensions.height
    ) {
      directionY = 1;
    }

    if (distanceFromLeft < thresholdX && scrollX.value > 0) {
      directionX = -1;
    } else if (distanceFromRight < thresholdX && scrollX.value < CONTENT_WIDTH - dimensions.width) {
      directionX = 1;
    }

    if (directionX !== 0 || directionY !== 0) {
      scheduleOnRN(startAutoScroll, directionX, directionY);
    } else {
      scheduleOnRN(stopAutoScroll);
    }
  };

  const panGesture = Gesture.Pan()
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      translateX.value = boxPosition.x;
      translateY.value = boxPosition.y;
      dragStartScrollY.value = scrollY.value;
      dragStartScrollX.value = scrollX.value;
    })
    .onUpdate(e => {
      const scrollDeltaX = scrollX.value - dragStartScrollX.value;
      const scrollDeltaY = scrollY.value - dragStartScrollY.value;

      translateX.value = snapToGrid(boxPosition.x + e.translationX + scrollDeltaX);
      translateY.value = snapToGrid(boxPosition.y + e.translationY + scrollDeltaY);

      const boxCenterX = CONTENT_WIDTH / 2 + translateX.value;
      const boxCenterY = CONTENT_HEIGHT / 2 + translateY.value;
      checkScrollEdge(boxCenterX, boxCenterY);
    })
    .onEnd(() => {
      scheduleOnRN(setBoxPosition, { x: translateX.value, y: translateY.value });
      scheduleOnRN(stopAutoScroll);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  const animatedGridX = useDerivedValue(() => translateX.value / GRID_SIZE);
  const animatedGridY = useDerivedValue(() => translateY.value / GRID_SIZE);

  const animatedLabelProps = useAnimatedProps<AnimatedTextInputProps>(() => ({
    text: `(${animatedGridX.value}, ${animatedGridY.value})`,
  }));

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.content}>
        <ScrollView
          ref={verticalScrollRef}
          style={styles.verticalScroll}
          onScroll={e => {
            scrollY.value = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          <ScrollView
            ref={horizontalScrollRef}
            horizontal
            style={styles.horizontalScroll}
            onScroll={e => {
              scrollX.value = e.nativeEvent.contentOffset.x;
            }}
            scrollEventThrottle={16}
          >
            <View style={styles.scrollContent}>
              <GridBackground />
              <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.box, animatedStyle]}>
                  <View style={styles.boxLabel}>
                    <AnimatedTextInput
                      style={styles.boxLabelText}
                      animatedProps={animatedLabelProps}
                      editable={false}
                      value="(0, 0)"
                    />
                  </View>
                </Animated.View>
              </GestureDetector>
            </View>
          </ScrollView>
        </ScrollView>
        <StatusBar style="auto" />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  verticalScroll: {
    flex: 1,
  },
  horizontalScroll: {
    flex: 1,
  },
  scrollContent: {
    width: CONTENT_WIDTH,
    height: CONTENT_HEIGHT,
    backgroundColor: '#fff',
  },
  gridContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CONTENT_WIDTH,
    height: CONTENT_HEIGHT,
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: '#e0e0e0',
    width: 1,
    height: 1,
  },
  box: {
    position: 'absolute',
    top: CONTENT_HEIGHT / 2 - BOX_SIZE / 2,
    left: CONTENT_WIDTH / 2 - BOX_SIZE / 2,
    width: BOX_SIZE,
    height: BOX_SIZE,
    backgroundColor: '#6366f1',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  boxLabel: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  boxLabelText: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
    textAlign: 'center',
    minWidth: 60,
    padding: 0,
  },
});
