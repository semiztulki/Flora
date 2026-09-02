import * as ImagePicker from "expo-image-picker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import * as attachmentsApi from "../api/attachments";
import { useAuth } from "../context/AuthContext";
import { getLocalAttachmentUri } from "../utils/attachmentCache";
import { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

// "ДД.ММ.ГГГГ" or "ДД.ММ" (year optional, toggled separately) <-> "YYYY-MM-DD".
function parseBirthdayInput(text: string): string | null {
  const match = text.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const y = year ?? "1900"; // placeholder year when the user chose not to share it
  return `${y.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function formatBirthdayForInput(isoDate: string | null, showYear: boolean): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return showYear ? `${d}.${m}.${y}` : `${d}.${m}`;
}

export default function ProfileScreen({ navigation }: Props) {
  const { user, updateProfile, updateAvatar } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [pronouns, setPronouns] = useState(user?.pronouns ?? "");
  const [birthdayShowYear, setBirthdayShowYear] = useState(user?.birthday_show_year ?? true);
  const [birthdayText, setBirthdayText] = useState(
    formatBirthdayForInput(user?.birthday ?? null, user?.birthday_show_year ?? true)
  );
  const [city, setCity] = useState(user?.city ?? "");
  const [country, setCountry] = useState(user?.country ?? "");
  const [languages, setLanguages] = useState(user?.languages ?? "");
  const [occupation, setOccupation] = useState(user?.occupation ?? "");
  const [interests, setInterests] = useState(user?.interests ?? "");
  const [about, setAbout] = useState(user?.about ?? "");
  const [website, setWebsite] = useState(user?.website ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailPublic, setEmailPublic] = useState(user?.email_public ?? false);
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [phonePublic, setPhonePublic] = useState(user?.phone_public ?? false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.avatar) {
      getLocalAttachmentUri(user.avatar.id, user.avatar.content_type)
        .then(setAvatarUri)
        .catch(() => {});
    } else {
      setAvatarUri(null);
    }
  }, [user?.avatar]);

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Нет доступа", "Разрешите доступ к галерее, чтобы выбрать аватар.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setIsUploadingAvatar(true);
    try {
      const fileName = asset.fileName ?? `avatar-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? "image/jpeg";
      const uploaded = await attachmentsApi.uploadAttachment(asset.uri, fileName, mimeType);
      await updateAvatar(uploaded.id);
    } catch (e: any) {
      Alert.alert("Не удалось загрузить аватар", e?.response?.data?.detail ?? "Попробуйте ещё раз");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setError(null);

    let birthdayIso: string | null | undefined;
    if (birthdayText.trim().length === 0) {
      birthdayIso = null; // explicit clear
    } else {
      const parsed = parseBirthdayInput(birthdayText.trim());
      if (!parsed) {
        setError('Дата рождения — в формате "ДД.ММ" или "ДД.ММ.ГГГГ"');
        return;
      }
      birthdayIso = parsed;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        pronouns: pronouns.trim(),
        birthday: birthdayIso,
        birthdayShowYear,
        city: city.trim(),
        country: country.trim(),
        languages: languages.trim(),
        occupation: occupation.trim(),
        interests: interests.trim(),
        about: about.trim(),
        website: website.trim(),
        email: email.trim(),
        emailPublic,
        phone: phone.trim(),
        phonePublic,
      });
      navigation.goBack();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось сохранить профиль");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.avatarWrap} onPress={handlePickAvatar} disabled={isUploadingAvatar}>
        {isUploadingAvatar ? (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <ActivityIndicator />
          </View>
        ) : avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarHint}>Добавить фото</Text>
          </View>
        )}
      </Pressable>

      <Text style={styles.label}>Номер (UIN)</Text>
      <Text style={styles.uinValue}>{user?.uin}</Text>

      <Text style={styles.label}>Ник</Text>
      <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />

      <Text style={styles.label}>Имя</Text>
      <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} />

      <Text style={styles.label}>Фамилия</Text>
      <TextInput style={styles.input} value={lastName} onChangeText={setLastName} />

      <Text style={styles.label}>Местоимения</Text>
      <TextInput style={styles.input} value={pronouns} onChangeText={setPronouns} placeholder="она / он / они" />

      <Text style={styles.label}>Дата рождения</Text>
      <TextInput
        style={styles.input}
        value={birthdayText}
        onChangeText={setBirthdayText}
        placeholder="ДД.ММ или ДД.ММ.ГГГГ"
        keyboardType="numbers-and-punctuation"
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Показывать год рождения</Text>
        <Switch value={birthdayShowYear} onValueChange={setBirthdayShowYear} />
      </View>

      <Text style={styles.label}>Город</Text>
      <TextInput style={styles.input} value={city} onChangeText={setCity} />

      <Text style={styles.label}>Страна</Text>
      <TextInput style={styles.input} value={country} onChangeText={setCountry} />

      <Text style={styles.label}>Языки</Text>
      <TextInput
        style={styles.input}
        value={languages}
        onChangeText={setLanguages}
        placeholder="русский, английский"
      />

      <Text style={styles.label}>Занятие</Text>
      <TextInput style={styles.input} value={occupation} onChangeText={setOccupation} />

      <Text style={styles.label}>Интересы</Text>
      <TextInput
        style={styles.input}
        value={interests}
        onChangeText={setInterests}
        placeholder="книги, кофе, старые фотоаппараты"
      />

      <Text style={styles.label}>О себе</Text>
      <TextInput
        style={[styles.input, styles.aboutInput]}
        value={about}
        onChangeText={setAbout}
        placeholder="Пара слов о себе"
        multiline
        maxLength={500}
      />

      <Text style={styles.label}>Сайт</Text>
      <TextInput
        style={styles.input}
        value={website}
        onChangeText={setWebsite}
        autoCapitalize="none"
        placeholder="https://…"
      />

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Показывать email в профиле</Text>
        <Switch value={emailPublic} onValueChange={setEmailPublic} />
      </View>

      <Text style={styles.label}>Телефон</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Показывать телефон в профиле</Text>
        <Switch value={phonePublic} onValueChange={setPhonePublic} />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={handleSave} disabled={isSaving || !displayName.trim()}>
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Сохранить</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 40 },
  avatarWrap: { alignSelf: "center", marginBottom: 8 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { backgroundColor: "#e9ecef", alignItems: "center", justifyContent: "center" },
  avatarHint: { fontSize: 12, color: "#868e96", textAlign: "center", paddingHorizontal: 8 },
  label: { fontSize: 13, fontWeight: "700", color: "#868e96", textTransform: "uppercase", marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    fontSize: 16,
  },
  aboutInput: { minHeight: 80, textAlignVertical: "top" },
  uinValue: { fontSize: 22, fontWeight: "700", marginTop: 4 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  switchLabel: { fontSize: 14, color: "#495057", flex: 1, marginRight: 8 },
  error: { color: "#c92a2a", marginTop: 16, textAlign: "center" },
  button: {
    backgroundColor: "#2f9e44",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
