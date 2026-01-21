<template>
  <div>
    <div
      class="w-full h-100vh overflow-hidden relative"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
      @wheel="handleWheel"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <div
        class="absolute top-15px left-15px z-11 flex justify-center items-center color-white cursor-pointer"
        @click.stop="router.push({ path: '/trending/movie' })"
        @touchstart.stop="router.push({ path: '/trending/movie' })"
      >
        <ElIconMenu class="w-24px" />
      </div>
      <div class="videos-wrapper">
        <div v-for="(movie, index) in movies" :key="movie.movieBasicsId" class="h-100vh relative">
          <!-- 视频封面或视频 -->
          <div class="h-full w-full relative">
            <NuxtImg
              v-if="movie.poster"
              :src="movie.poster"
              class="h-full w-full object-cover"
              format="webp"
              loading="lazy"
              :alt="movie.title"
            />
            <div v-else class="h-full w-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
              <span class="text-white text-24px">{{ movie.title }}</span>
            </div>
            <!-- 播放按钮覆盖层 - 只在非当前视频或没有海报时显示 -->
            <div
              v-if="index !== currentIndex"
              class="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer z-10"
              @click="router.push(`/column/${movie.columnValue}/detail/${movie.movieBasicsId}`)"
            >
              <div class="w-80px h-80px border-rd-50% flex justify-center items-center bg-black/50 border-4 border-white/50">
                <i class="i-el-caret-right color-white w-40px h-40px block"></i>
              </div>
            </div>
          </div>
          
          <!-- 视频信息 -->
          <div class="video-info">
            <h3 class="text-white text-20px font-bold mb-10px">{{ movie.title }}</h3>
            <p v-if="movie.titleEn" class="text-white/80 text-14px mb-10px">{{ movie.titleEn }}</p>
            <p v-if="movie.summary" class="text-white/70 text-12px line-clamp-3">{{ movie.summary }}</p>
            <div v-if="movie.movieRate?.rateUserCount" class="flex items-center gap-8px mt-10px">
              <span class="text-yellow text-16px font-bold">{{ movie.movieRate.rate.toFixed(1) }}</span>
              <span class="text-white/60 text-12px">({{ movie.movieRate.rateUserCount }}人评价)</span>
            </div>
            <div v-if="movie.casts && movie.casts.length > 0" class="flex items-center gap-8px mt-10px flex-wrap">
              <span class="text-white/60 text-12px">主演：</span>
              <template v-for="(cast, idx) in movie.casts.slice(0, 3)" :key="idx">
                <span class="text-white/80 text-12px">{{ cast.actor?.name }}</span>
                <span v-if="idx < movie.casts.slice(0, 3).length - 1" class="text-white/40">/</span>
              </template>
            </div>
            <nuxt-link
              :to="`/column/${movie.columnValue}/detail/${movie.movieBasicsId}`"
              class="inline-block mt-15px px-20px py-8px bg-white/20 backdrop-blur-10px rounded-20px text-white text-14px hover:bg-white/30 transition-all"
            >
              查看详情
            </nuxt-link>
          </div>
          
          <!-- 右侧操作按钮 -->
          <div class="video-actions">
            <div class="action-icon" @click.stop="handleLike(movie)">
              <i
                class="i-el-heart w-32px h-32px transition-all"
                :class="[movie.isLiked ? '!color-#FE2C55' : 'color-white']"
              ></i>
              <span>{{ formatNumber(movie.likes || 0) }}</span>
            </div>
            <div class="action-icon" @click.stop="handleFavorite(movie)">
              <i
                class="i-el-star w-32px h-32px transition-all"
                :class="[movie.isFavorited ? '!color-#FFD700' : 'color-white']"
              ></i>
              <span>收藏</span>
            </div>
            <div class="action-icon" @click.stop="handleShare(movie)">
              <i class="i-el-share-alt w-28px h-28px color-white"></i>
              <span>分享</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <Login />
  </div>
</template>

<script setup lang="ts">
  import { useAsyncData } from '#app';
  import { WEB_TOKEN } from '#shared/cookiesName';
  import type { WebMovieListItem } from '~~/types/api/webMovieList';

  definePageMeta({
    layout: false
  });

  const token = useCookie(WEB_TOKEN);
  const router = useRouter();
  const currentIndex = ref(0);
  const previousIndex = ref(0);
  const isDragging = ref(false);
  const startY = ref(0);
  const initialOffset = ref(0);
  const threshold = 100;
  const movies = ref<WebMovieListItem[]>([]);
  const pageNum = ref(1);

  // 获取电影列表
  const { data, refresh } = await useAsyncData(`movies:${pageNum.value}`, () => {
    return $fetch('/api/web/movie/list', {
      query: {
        pageNum: pageNum.value,
        limit: 10,
        orderBy: 'pv'
      }
    });
  });

  if (data.value) {
    movies.value = movies.value.concat(
      data.value.rows.map(movie => ({
        ...movie,
        isLiked: false,
        isFavorited: false,
        likes: movie.pv?.pv || 0
      }))
    );
  }

  const currentMovie = computed(() => {
    return movies.value[currentIndex.value];
  });

  const scrollToMovie = async (index: number) => {
    if (isDragging.value) return;
    const offset = -index * 100;
    const videosWrapper = document.querySelector('.videos-wrapper');
    if (videosWrapper) {
      videosWrapper.style.transform = `translateY(${offset}vh)`;
    }

    if (previousIndex.value !== index) {
      if (index === movies.value.length - 1) {
        pageNum.value++;
        await refresh();
        if (data.value && data.value.rows.length) {
          movies.value = movies.value.concat(
            data.value.rows.map(movie => ({
              ...movie,
              isLiked: false,
              isFavorited: false,
              likes: movie.pv?.pv || 0
            }))
          );
        } else {
          pageNum.value = 0;
        }
      }
    }
    previousIndex.value = index;
  };

  const handleMouseDown = (event: MouseEvent) => {
    isDragging.value = true;
    startY.value = event.clientY;
    initialOffset.value = -currentIndex.value * 100;
    const videosWrapper = document.querySelector('.videos-wrapper');
    if (videosWrapper) {
      videosWrapper.style.transition = 'none';
    }
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!isDragging.value) return;
    const deltaY = event.clientY - startY.value;
    const newOffset = initialOffset.value + (deltaY / window.innerHeight) * 100;
    const videosWrapper = document.querySelector('.videos-wrapper');
    if (videosWrapper) {
      videosWrapper.style.transform = `translateY(${newOffset}vh)`;
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDragging.value) return;
    isDragging.value = false;
    const endY = event.clientY;
    const deltaY = endY - startY.value;
    const videosWrapper = document.querySelector('.videos-wrapper');
    if (videosWrapper) {
      videosWrapper.style.transition = 'transform 0.3s ease-in-out';
    }
    if (deltaY < -threshold && currentIndex.value < movies.value.length - 1) {
      currentIndex.value++;
    } else if (deltaY > threshold && currentIndex.value > 0) {
      currentIndex.value--;
    }
    scrollToMovie(currentIndex.value);
  };

  const handleWheel = (event: WheelEvent) => {
    const delta = event.deltaY;
    if (delta > 0 && currentIndex.value < movies.value.length - 1) {
      currentIndex.value++;
      scrollToMovie(currentIndex.value);
    } else if (delta < 0 && currentIndex.value > 0) {
      currentIndex.value--;
      scrollToMovie(currentIndex.value);
    }
  };

  const handleTouchStart = (event: TouchEvent) => {
    isDragging.value = true;
    startY.value = event.touches[0].clientY;
    initialOffset.value = -currentIndex.value * 100;
    const videosWrapper = document.querySelector('.videos-wrapper');
    if (videosWrapper) {
      videosWrapper.style.transition = 'none';
    }
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (!isDragging.value) return;
    const deltaY = event.touches[0].clientY - startY.value;
    const newOffset = initialOffset.value + (deltaY / window.innerHeight) * 100;
    const videosWrapper = document.querySelector('.videos-wrapper');
    if (videosWrapper) {
      videosWrapper.style.transform = `translateY(${newOffset}vh)`;
    }
  };

  const handleTouchEnd = (event: TouchEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDragging.value) return;
    isDragging.value = false;
    const endY = event.changedTouches[0].clientY;
    const deltaY = endY - startY.value;
    const videosWrapper = document.querySelector('.videos-wrapper');
    if (videosWrapper) {
      videosWrapper.style.transition = 'transform 0.3s ease-in-out';
    }
    if (deltaY < -threshold && currentIndex.value < movies.value.length - 1) {
      currentIndex.value++;
    } else if (deltaY > threshold && currentIndex.value > 0) {
      currentIndex.value--;
    }
    scrollToMovie(currentIndex.value);
  };


  function formatNumber(num: number) {
    if (!num) return '0';
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
  }

  function handleLike(movie: WebMovieListItem) {
    if (!token.value) {
      const loginVisible = useLoginVisible();
      loginVisible.value = true;
      return;
    }
    // TODO: 实现点赞功能
    movie.isLiked = !movie.isLiked;
    if (movie.isLiked) {
      movie.likes = (movie.likes || 0) + 1;
    } else {
      movie.likes = Math.max(0, (movie.likes || 0) - 1);
    }
  }

  function handleFavorite(movie: WebMovieListItem) {
    if (!token.value) {
      const loginVisible = useLoginVisible();
      loginVisible.value = true;
      return;
    }
    // TODO: 实现收藏功能
    movie.isFavorited = !movie.isFavorited;
  }

  function handleShare(movie: WebMovieListItem) {
    // TODO: 实现分享功能
    if (navigator.share) {
      navigator.share({
        title: movie.title,
        text: movie.summary || '',
        url: `${window.location.origin}/column/${movie.columnValue}/detail/${movie.movieBasicsId}`
      });
    } else {
      // 复制链接到剪贴板
      const url = `${window.location.origin}/column/${movie.columnValue}/detail/${movie.movieBasicsId}`;
      navigator.clipboard.writeText(url).then(() => {
        // 可以显示提示消息
      });
    }
  }
</script>

<style lang="scss">
  .videos-wrapper {
    @apply w-full relative;
    transition: transform 0.3s ease-in-out;
  }

  .movie-video {
    @apply w-full h-full object-contain top-0 left-0;
  }

  .video-info {
    @apply absolute bottom-80px left-20px z-10 max-w-70%;
  }

  .video-actions {
    @apply absolute bottom-80px right-15px flex flex-col gap-15px z-10;

    .action-icon {
      @apply flex flex-col items-center gap-5px cursor-pointer transition-all duration-200;

      &:hover {
        transform: scale(1.1);
      }

      i {
        @apply text-white opacity-90 transition-all duration-200;
      }

      span {
        @apply text-white text-12px opacity-80;
      }
    }
  }

  // 动画效果
  .animate__bounceIn {
    animation: bounceIn 1s ease;
  }

  @keyframes bounceIn {
    0% {
      transform: scale(0.3);
      opacity: 0;
    }
    50% {
      transform: scale(1.05);
    }
    70% {
      transform: scale(0.9);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
